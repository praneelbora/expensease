// src/components/ScanReceiptSheet.js
import React, { useMemo, useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Image,
  Alert,
  ActivityIndicator,
  TextInput,
  FlatList,
  ScrollView,
  Modal,
  Platform,
  Linking,
  Dimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { fetchFriendsPaymentMethods, createPaymentMethod } from "/services/PaymentMethodService";

import * as ImagePicker from "expo-image-picker";
import * as ImageManipulator from "expo-image-manipulator";
import { KeyboardAwareScrollView } from "react-native-keyboard-aware-scroll-view";
import { useTheme } from "context/ThemeProvider";
import { useAuth } from "context/AuthContext";
import BottomSheetLayout from "./btmShtHeaderFooter";
import Dropdown from "./dropDown";
import { uploadReceipt } from "../services/ImageService";
import { api } from "../utils/api";
import Edit from "@/accIcons/edit.svg";
import { createExpense } from "/services/ExpenseService";
/**
 * ScanReceiptSheet
 * - Preview uses dynamic height based on image aspect ratio (width: 100%)
 * - Adds current user ("me") to friends list when available from /v1/me
 * - When selecting a single friend we include "me" as a participant as well
 *
 * Footer-driven actions:
 *  - preview -> Choose another / Upload & Parse (footer)
 *  - picking -> Cancel / Confirm (footer)
 *  - parsed  -> Cancel / Use Parsed Result (footer)
 *
 * Service charge:
 *  - editable absolute amount and percent fields
 *  - if absolute amount provided it is used
 *  - if only percent provided and subtotal available, computedServiceCharge = subtotal * percent / 100
 *  - both values included in final payload
 *
 * Extras splitting control:
 *  - extraSplitMode: "proportional" (default) or "equal"
 *  - affects distribution of tax/service/tip shares across participants
 */

const MIN_LOADING_MS = 800;
const POLL_INTERVAL_MS = 2000;
const MAX_PREVIEW_HEIGHT = 860;

const ScanReceiptSheet = ({ innerRef, onParsed, onClose }) => {
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const { user } = useAuth();
  const colors = theme?.colors || {};
  const styles = useMemo(() => createStyles(colors, theme), [colors, theme]);

  // stages: choose | preview | picking | loading | parsed
  const [stage, setStage] = useState("choose");

  // image & upload
  const [localImage, setLocalImage] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [previewHeight, setPreviewHeight] = useState(240);

  // friends/groups + current user
  const [friends, setFriends] = useState([]);
  const [groups, setGroups] = useState([]);
  const [searchQ, setSearchQ] = useState("");
  const [currentUser, setCurrentUser] = useState(null);

  // selection (single friend or single group)
  const [selectedFriend, setSelectedFriend] = useState(null);
  const [selectedGroup, setSelectedGroup] = useState(null);
  const [selectionConfirmed, setSelectionConfirmed] = useState(false);

  // parsing & job
  const [jobId, setJobId] = useState(null);
  const [parsingPending, setParsingPending] = useState(false);
  const [serverParsed, setServerParsed] = useState(null);

  // items and participants
  const [editingItems, setEditingItems] = useState([]); // {id,name,amount,consumers:[]}
  const [confirmedParticipants, setConfirmedParticipants] = useState([]);

  // per-item edit + modal
  const [editingItemId, setEditingItemId] = useState(null);
  const [consumersModalVisible, setConsumersModalVisible] = useState(false);
  const [currentItemForModal, setCurrentItemForModal] = useState(null);

  // service charge UI state (editable)
  const [localServiceCharge, setLocalServiceCharge] = useState(null); // absolute amount (string or number)
  const [localServiceChargePercent, setLocalServiceChargePercent] = useState(null); // percent (string or number)

  // new: extra split mode - "proportional" | "equal"
  const [extraSplitMode, setExtraSplitMode] = useState("proportional");
  const [editTotalsOpen, setEditTotalsOpen] = useState(false);            // NEW
  const [splitModeMenuOpen, setSplitModeMenuOpen] = useState(false);      // NEW
  const pollTimerRef = useRef(null);
  const uploadStartRef = useRef(0);
  const [receiptMeta, setReceiptMeta] = useState(null);

  // who paid
  const [payers, setPayers] = useState({}); // { [participantId]: { paying: boolean, amount?: number } }
  const round2 = (n) => Math.round(n * 100) / 100;

  const normalizeOwesToAmount = (rows, amount) => {
    const targetCents = Math.round(Number(amount || 0) * 100);

    // current owes in cents (only for rows.owing === true)
    const oweIdxs = [];
    const cents = rows.map((r, i) => {
      if (r.owing) {
        oweIdxs.push(i);
        return Math.round(Number(r.oweAmount || 0) * 100);
      }
      return 0;
    });

    const sumCents = oweIdxs.reduce((s, i) => s + cents[i], 0);
    const delta = targetCents - sumCents; // may be -1, 0, +1, etc.

    if (delta !== 0 && oweIdxs.length > 0) {
      const lastIdx = oweIdxs[oweIdxs.length - 1];
      cents[lastIdx] += delta;
    }

    // write back normalized oweAmount
    const fixed = rows.map((r, i) =>
      r.owing ? { ...r, oweAmount: round2(cents[i] / 100) } : r
    );

    return fixed;
  };
  // ---------- helper: fetch friends/groups + me ----------
  const fetchFriendsAndGroups = async () => {
    try {
      const [fRes, gRes] = await Promise.allSettled([api.get("/v1/friends"), api.get("/v1/groups")]);

      const fItems =
        fRes.status === "fulfilled"
          ? Array.isArray(fRes.value?.items)
            ? fRes.value.items
            : fRes.value?.items ?? fRes.value ?? []
          : [];

      const gItems =
        gRes.status === "fulfilled"
          ? Array.isArray(gRes.value?.items)
            ? gRes.value.items
            : gRes.value?.items ?? gRes.value ?? []
          : [];

      // normalize me object
      const meNormalized = user ?? null;

      // if meNormalized exists and not already in friends list, prepend it as "You"
      let finalFriends = Array.isArray(fItems) ? [...fItems] : [];
      if (meNormalized) {
        const already = finalFriends.some((x) => x._id === meNormalized._id || x.id === meNormalized._id);
        if (!already) {
          finalFriends = [{ _id: meNormalized._id, name: meNormalized.name || "You", isMe: true }, ...finalFriends];
        } else {
          finalFriends = finalFriends.map((f) =>
            f._id === meNormalized._id || f.id === meNormalized._id ? { ...f, name: meNormalized.name || f.name } : f
          );
        }
      }

      setFriends(finalFriends);
      setGroups(Array.isArray(gItems) ? gItems : []);
      setCurrentUser(meNormalized);
    } catch (e) {
      console.warn("fetch friends/groups failed", e);
    }
  };

  useEffect(() => {
    fetchFriendsAndGroups();
    return () => {
      if (pollTimerRef.current) {
        clearInterval(pollTimerRef.current);
        pollTimerRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---------- permissions & pickers ----------
  const ensurePermission = async (kind) => {
    try {
      const getPerm =
        kind === "camera" ? ImagePicker.getCameraPermissionsAsync : ImagePicker.getMediaLibraryPermissionsAsync;
      const reqPerm =
        kind === "camera" ? ImagePicker.requestCameraPermissionsAsync : ImagePicker.requestMediaLibraryPermissionsAsync;

      const cur = await getPerm();
      if (cur.status === "granted") return true;
      const req = await reqPerm();
      if (req.status === "granted") return true;

      Alert.alert("Permission required", `Please enable ${kind} access in settings.`, [
        { text: "Cancel", style: "cancel" },
        {
          text: "Open settings",
          onPress: () => (Platform.OS === "ios" ? Linking.openURL("app-settings:") : Linking.openSettings()),
        },
      ]);
      return false;
    } catch (e) {
      console.warn("perm err", e);
      return false;
    }
  };

  const pickFromCamera = async () => {
    const ok = await ensurePermission("camera");
    if (!ok) return;
    try {
      const photo = await ImagePicker.launchCameraAsync({ quality: 0.8 });
      if (!photo.canceled && photo.assets?.[0]?.uri) handleLocalImage(photo.assets[0].uri);
    } catch (e) {
      console.warn(e);
      Alert.alert("Error", "Could not open camera.");
    }
  };

  const pickFromGallery = async () => {
    const ok = await ensurePermission("mediaLibrary");
    if (!ok) return;
    try {
      const photo = await ImagePicker.launchImageLibraryAsync({ quality: 0.8 });
      if (!photo.canceled && photo.assets?.[0]?.uri) handleLocalImage(photo.assets[0].uri);
    } catch (e) {
      console.warn(e);
      Alert.alert("Error", "Could not open gallery.");
    }
  };

  // ---------- determine preview height from image aspect ratio ----------
  const computePreviewHeight = (uri) => {
    if (!uri) return;
    Image.getSize(
      uri,
      (w, h) => {
        const windowWidth = Dimensions.get("window").width;
        const horizontalPadding = 32 + 24; // safety: sheet adds some padding + container
        const availableWidth = Math.max(200, windowWidth - horizontalPadding);
        const calcHeight = Math.round((availableWidth * h) / w);
        const finalHeight = Math.min(calcHeight, MAX_PREVIEW_HEIGHT);
        setPreviewHeight(finalHeight);
      },
      (err) => {
        console.warn("Image.getSize failed:", err);
        setPreviewHeight(240);
      }
    );
  };

  const handleLocalImage = async (uri) => {
    try {
      // reset states
      setServerParsed(null);
      setEditingItems([]);
      setSelectedFriend(null);
      setSelectedGroup(null);
      setSelectionConfirmed(false);
      setConfirmedParticipants([]);
      setLocalServiceCharge(null);
      setLocalServiceChargePercent(null);
      setExtraSplitMode("proportional");
      uploadStartRef.current = 0;

      const manip = await ImageManipulator.manipulateAsync(uri, [{ resize: { width: 1600 } }], {
        compress: 0.8,
        format: ImageManipulator.SaveFormat.JPEG,
      });

      setLocalImage({ uri: manip.uri });
      computePreviewHeight(manip.uri);
      setStage("preview");
    } catch (e) {
      console.warn(e);
      Alert.alert("Error", "Could not process the image.");
    }
  };

  // ---------- upload + polling ----------
  const uploadImageToServer = async (uri) => {
    setUploading(true);
    setParsingPending(false);
    setJobId(null);
    setServerParsed(null);
    setEditingItems([]);
    setSelectionConfirmed(false);
    setConfirmedParticipants([]);
    setLocalServiceCharge(null);
    setLocalServiceChargePercent(null);
    setExtraSplitMode("proportional");

    fetchFriendsAndGroups();
    uploadStartRef.current = Date.now();

    try {
      const fileObj = { uri, name: `receipt_${Date.now()}.jpg`, type: "image/jpeg" };
      const resp = await uploadReceipt(fileObj);
      const data = resp?.data ?? resp;
      if (!data) throw new Error("Empty response from server");
      if (data.receiptId || data.file) {
        setReceiptMeta({
          receiptId: data.receiptId ?? null,
          file: data.file ?? null,              // { bucket, key, url, contentType, size }
          model: data.model ?? null,
          paidUser: data.paid_user ?? null,
          token_estimate: data.token_estimate ?? null,
          processing_ms: data.processing_ms ?? null,
        });
      }
      const immediateParsed = data.parsed ?? (data.items || data.rawText ? data : null);
      if (immediateParsed) {
        const elapsed = Date.now() - uploadStartRef.current;
        const wait = Math.max(0, MIN_LOADING_MS - elapsed);
        setTimeout(() => {
          applyParsed(immediateParsed);
          setStage("picking"); // require user to confirm friend/group first
        }, wait);
        return;
      }

      const jid = data.jobId || data.id || data.job?.id;
      if (jid) {
        setJobId(jid);
        setParsingPending(true);
        setStage("picking");
        startPolling(jid);
        return;
      }

      if (data.rawText) {
        const elapsed2 = Date.now() - uploadStartRef.current;
        const wait2 = Math.max(0, MIN_LOADING_MS - elapsed2);
        setTimeout(() => {
          applyParsed(data);
          setStage("picking");
        }, wait2);
        return;
      }

      throw new Error("Unexpected server response");
    } catch (e) {
      console.error("uploadImage err", e);
      Alert.alert("Upload failed", e.message || "Server error");
      setStage("preview");
    } finally {
      setUploading(false);
    }
  };

  const startPolling = (jid) => {
    if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
    const pollOnce = async () => {
      try {
        const res = await api.get(`/v1/image/status/${jid}`);
        const payload = res?.job ?? res?.data ?? res;
        const status = payload?.status || payload?.job?.status || payload?.state;
        const parsed = payload?.parsed || payload?.job?.parsed || payload?.parsedResult || null;

        if ((status === "done" || status === "finished") && parsed) {
          clearInterval(pollTimerRef.current);
          pollTimerRef.current = null;
          setParsingPending(false);
          applyParsed(parsed);
          if (selectionConfirmed) setStage("parsed");
          else setStage("picking");
          return;
        }

        if (parsed && !status) {
          clearInterval(pollTimerRef.current);
          pollTimerRef.current = null;
          setParsingPending(false);
          applyParsed(parsed);
          if (selectionConfirmed) setStage("parsed");
          else setStage("picking");
          return;
        }
      } catch (err) {
        console.warn("poll error", err);
      }
    };

    pollOnce();
    pollTimerRef.current = setInterval(pollOnce, POLL_INTERVAL_MS);
  };
  // ---------- apply parsed ----------
  const applyParsed = (parsed) => {
    setServerParsed(parsed || {});
    const items = Array.isArray(parsed.items) ? parsed.items : [];
    const normalized = items.map((it, idx) => {
      const id = it.id ?? `it-${idx}`;
      return {
        id,
        name: it.name ?? "",
        amount: Number(it.amount ?? 0),
        consumers: Array.isArray(it.consumers) ? it.consumers.slice() : [],
      };
    });
    setEditingItems(normalized);

    // load service charge if provided by server
    setLocalServiceCharge(parsed?.serviceCharge ?? (parsed?.serviceCharge === 0 ? 0 : null));
    setLocalServiceChargePercent(parsed?.serviceChargePercent ?? (parsed?.serviceChargePercent === 0 ? 0 : null));

    // if selection already confirmed, assign default consumers and go parsed
    if (selectionConfirmed) {
      // build participants based on current selection
      const participants =
        selectedFriend
          ? uniqById([...(currentUser ? [currentUser] : []), selectedFriend])
          : selectedGroup
            ? uniqById([...(Array.isArray(selectedGroup.members) ? selectedGroup.members : []), ...(currentUser ? [currentUser] : [])])
            : [];
      setConfirmedParticipants(participants);
      setStage("parsed");
      // ensure default consumers
      setTimeout(assignAllItemsToParticipants, 0);
    }
  };

  // ---------- selection ----------
  const onSelectFriendSingle = (f) => {
    if (selectionConfirmed) return;
    setSelectedFriend((prev) => (prev && prev._id === f._id ? null : f));
    setSelectedGroup(null);
  };
  const onSelectGroupSingle = (g) => {
    if (selectionConfirmed) return;
    setSelectedGroup((prev) => (prev && prev._id === g._id ? null : g));
    setSelectedFriend(null);
  };

  const onConfirmSelection = () => {
    if (!selectedFriend && !selectedGroup) {
      Alert.alert("Select one", "Please select one friend or one group before confirming.");
      return;
    }
    setSelectionConfirmed(true);

    if (selectedFriend) {
      const participants = uniqById([...(currentUser ? [currentUser] : []), selectedFriend]);
      const ids = participants.map((p) => p._id).filter(Boolean);
      editingItems.forEach((el) => (el.consumers = ids));
      setConfirmedParticipants(participants);
      // NEW: fetch PMs for these participants
      updateParticipantsPaymentMethods(ids);
    } else if (selectedGroup) {
      const members = Array.isArray(selectedGroup.members) ? selectedGroup.members : [];
      const participants = uniqById([...members, ...(currentUser ? [currentUser] : [])]);
      const ids = participants.map((p) => p._id).filter(Boolean);
      editingItems.forEach((el) => (el.consumers = ids));
      setConfirmedParticipants(participants);
      // NEW: fetch PMs for these participants
      updateParticipantsPaymentMethods(ids);
    }

    if (!parsingPending && serverParsed) {
      setStage("parsed");
      setTimeout(assignAllItemsToParticipants, 0);
    } else {
      setStage("loading");
    }
  };


  // Fetch PMs for participants and merge into confirmedParticipants
  const updateParticipantsPaymentMethods = async (ids) => {
    if (!ids?.length) return;
    try {
      const map = await fetchFriendsPaymentMethods(ids, user?.token); // or userToken if you have it separately
      setConfirmedParticipants((prev) =>
        prev.map((p) => {
          const pid = p._id || p.id;
          const raw = map[pid] || [];
          let selectedPaymentMethodId = p.selectedPaymentMethodId;

          // keep previously picked PM if still available; otherwise smart-default
          const stillValid = raw.some((m) => m.paymentMethodId === selectedPaymentMethodId);
          if (!stillValid) {
            selectedPaymentMethodId = raw.length === 1 ? raw[0].paymentMethodId : null;
          }

          return { ...p, paymentMethods: raw, selectedPaymentMethodId };
        })
      );

      // also keep payers map in sync if some were already toggled on
      setPayers((prev) => {
        const next = { ...prev };
        ids.forEach((pid) => {
          const pms = map[pid] || [];
          // if payer is active and has exactly one PM, default it
          if (next[pid]?.paying) {
            if (pms.length === 1) next[pid].paymentMethodId = pms[0].paymentMethodId;
            // if previously chosen PM is no longer valid, clear it
            if (pms.length > 1 && !pms.some((m) => m.paymentMethodId === next[pid].paymentMethodId)) {
              next[pid].paymentMethodId = null;
            }
          }
        });
        return next;
      });
    } catch (e) {
      // ignore for now (can toast/log if needed)
      console.warn("updateParticipantsPaymentMethods failed", e);
    }
  };

  // ---------- consumers modal ----------
  const openConsumersModal = (item) => {
    if (!selectionConfirmed) {
      Alert.alert("Confirm selection", "Please confirm your friend/group selection before assigning consumers.");
      return;
    }
    setCurrentItemForModal(item);
    setConsumersModalVisible(true);
  };

  const toggleParticipantForCurrentModal = (personId) => {
    if (!currentItemForModal) return;
    setEditingItems((prev) =>
      prev.map((it) => {
        if (it.id !== currentItemForModal.id) return it;
        const cur = Array.isArray(it.consumers) ? [...it.consumers] : [];
        const exists = cur.includes(personId);
        const next = exists ? cur.filter((x) => x !== personId) : [...cur, personId];
        const updated = { ...it, consumers: next };
        setCurrentItemForModal(updated);
        return updated;
      })
    );
  };

  const closeConsumersModal = () => {
    setCurrentItemForModal(null);
    setConsumersModalVisible(false);
  };

  const startEditingItem = (id) => setEditingItemId(id);
  const stopEditingItem = () => setEditingItemId(null);

  // ---------- service charge helpers ----------
  const subtotal = () => editingItems.reduce((s, it) => s + (Number(it.amount) || 0), 0);

  const parseNumberInput = (v) => {
    if (v === null || v === undefined || v === "") return null;
    const cleaned = String(v).replace(/,/g, "").trim();
    const num = Number(cleaned);
    if (isNaN(num)) return null;
    return Math.round(num * 100) / 100;
  };

  const parsedLocalServiceCharge = () => parseNumberInput(localServiceCharge);
  const parsedLocalServiceChargePercent = () => parseNumberInput(localServiceChargePercent);

  const computedServiceChargeFromPercent = () => {
    const pct = parsedLocalServiceChargePercent();
    const sub = subtotal();
    if (pct == null || sub == null || sub === 0) return null;
    const amt = Math.round((sub * (pct / 100)) * 100) / 100;
    return amt;
  };

  const effectiveServiceChargeAmount = () => {
    const absolute = parsedLocalServiceCharge();
    if (absolute != null) return absolute;
    const computed = computedServiceChargeFromPercent();
    return computed != null ? computed : null;
  };

  // ---------- splitting logic (respects extraSplitMode) ----------
  // returns object: { participantTotals: {id: { itemShare, taxShare, serviceShare, tipShare, total } }, subtotal, tax, service, tip, extraSplitMode }
  const computeSplits = () => {
    const participants = confirmedParticipants || [];
    const pIds = participants.map((p) => p._id || p.id).filter(Boolean);
    const subtotalVal = subtotal();
    const taxVal = Number(serverParsed?.tax ?? 0) || 0;
    const tipVal = Number(serverParsed?.tip ?? 0) || 0;
    const serviceVal = Number(effectiveServiceChargeAmount() ?? 0) || 0;

    // init
    const participantItemTotals = {};
    pIds.forEach((id) => (participantItemTotals[id] = 0));

    // distribute item amounts: if item has N consumers, split equally among them.
    editingItems.forEach((it) => {
      const amt = Number(it.amount) || 0;
      const consumers = Array.isArray(it.consumers) ? it.consumers : [];
      if (consumers.length === 0) {
        // skip (will be validated elsewhere)
        return;
      }
      const perPerson = amt / consumers.length;
      consumers.forEach((pid) => {
        if (!participantItemTotals[pid]) participantItemTotals[pid] = 0;
        participantItemTotals[pid] += perPerson;
      });
    });

    // compute totals
    const totals = {};
    const totalItemAssigned = Object.values(participantItemTotals).reduce((s, v) => s + (Number(v) || 0), 0);
    const fallbackEqualShare = subtotalVal > 0 && totalItemAssigned === 0 && pIds.length > 0;

    // determine how extras are split:
    // - "proportional": use item proportion (itemShare / subtotal)
    // - "equal": split extras equally across participants
    pIds.forEach((id) => {
      const itemShare = fallbackEqualShare ? subtotalVal / pIds.length : (participantItemTotals[id] || 0);
      const proportion = subtotalVal > 0 ? (itemShare / subtotalVal) : (pIds.length ? (1 / pIds.length) : 0);

      let taxShare = 0;
      let serviceShare = 0;
      let tipShare = 0;

      if (extraSplitMode === "equal") {
        const equalDiv = pIds.length || 1;
        taxShare = Math.round((taxVal / equalDiv) * 100) / 100;
        serviceShare = Math.round((serviceVal / equalDiv) * 100) / 100;
        tipShare = Math.round((tipVal / equalDiv) * 100) / 100;
      } else {
        // proportional
        taxShare = Math.round((taxVal * proportion) * 100) / 100;
        serviceShare = Math.round((serviceVal * proportion) * 100) / 100;
        tipShare = Math.round((tipVal * proportion) * 100) / 100;
      }

      const total = Math.round((itemShare + taxShare + serviceShare + tipShare) * 100) / 100;
      totals[id] = {
        itemShare: Math.round(itemShare * 100) / 100,
        taxShare,
        serviceShare,
        tipShare,
        total,
      };
    });

    return {
      participantTotals: totals,
      subtotal: Math.round(subtotalVal * 100) / 100,
      tax: Math.round(taxVal * 100) / 100,
      service: Math.round(serviceVal * 100) / 100,
      tip: Math.round(tipVal * 100) / 100,
      extraSplitMode,
    };
  };

  // whether every editing item has at least one assigned consumer
  const allItemsAssigned = useMemo(() => {
    if (!editingItems || editingItems.length === 0) return false;
    return editingItems.every((it) => Array.isArray(it.consumers) && it.consumers.length > 0);
  }, [editingItems, confirmedParticipants]);
  // computed splits memo
  const splits = useMemo(() => computeSplits(), [editingItems, confirmedParticipants, serverParsed, localServiceCharge, localServiceChargePercent, extraSplitMode]);

  // ---------- finalize ----------


  const onUseParsedWithConfirm = () => {
    // validate
    if (!selectionConfirmed) {
      Alert.alert("Confirm selection", "Please confirm the friend or group selection first.");
      return;
    }
    if (!allItemsAssigned) {
      Alert.alert("Assign items", "Each line item must be assigned to at least one person before saving.");
      return;
    }
    // final confirmation: immutable
    Alert.alert(
      "Save expense",
      "This expense will be saved and cannot be edited later. Are you sure you want to proceed?",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Save", style: "destructive", onPress: finalizeAndClose },
      ]
    );
  };

  const resetAll = () => {
    setStage("choose");
    setLocalImage(null);
    setUploading(false);
    setJobId(null);
    setParsingPending(false);
    setServerParsed(null);
    setEditingItems([]);
    setSelectedFriend(null);
    setSelectedGroup(null);
    setSelectionConfirmed(false);
    setConfirmedParticipants([]);
    setEditingItemId(null);
    setConsumersModalVisible(false);
    setCurrentItemForModal(null);
    setLocalServiceCharge(null);
    setLocalServiceChargePercent(null);
    setExtraSplitMode("proportional");
    setReceiptMeta(null);
    if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
    // keep friends/groups fetched so user doesn't have to wait again
  };

  // ---------- small helpers ----------
  const formatCurrency = (amt) => {
    const n = Number(amt) || 0;
    return n.toFixed(2);
  };

  const filteredFriends = friends.filter((f) => (f.name || "").toLowerCase().includes((searchQ || "").toLowerCase()));
  const filteredGroups = groups.filter((g) => (g.name || "").toLowerCase().includes((searchQ || "").toLowerCase()));

  const FriendRow = ({ f }) => {
    const active = selectedFriend && selectedFriend._id === f._id;
    const label = f.isMe ? `${f.name}` : f.name;
    return (
      <TouchableOpacity onPress={() => onSelectFriendSingle(f)} style={[styles.rowItem, active && styles.rowItemActive]}>
        <Text style={[styles.rowText, active && styles.rowTextActive]} numberOfLines={1}>{label}</Text>
      </TouchableOpacity>
    );
  };
  const GroupRow = ({ g }) => {
    const active = selectedGroup && selectedGroup._id === g._id;
    return (
      <TouchableOpacity onPress={() => onSelectGroupSingle(g)} style={[styles.rowItem, active && styles.rowItemActive]}>
        <Text style={[styles.rowText, active && styles.rowTextActive]} numberOfLines={1}>{g.name}</Text>
      </TouchableOpacity>
    );
  };

  // ensure uniqueness by id helper
  function uniqById(arr = []) {
    const seen = new Set();
    return arr.filter((x) => {
      const id = x?._id ?? x?.id;
      if (!id) return false;
      if (seen.has(id)) return false;
      seen.add(id);
      return true;
    });
  }

  // ---------- renderFooter: dynamic footer content ----------

  // grand total (used for paid validation)
  const grandTotal = useMemo(() => {
    const sub = subtotal();
    const tax = Number(serverParsed?.tax ?? 0);
    const tip = Number(serverParsed?.tip ?? 0);
    const service = Number(effectiveServiceChargeAmount() ?? 0);
    return Math.round((sub + tax + service + tip) * 100) / 100;
  }, [editingItems, serverParsed, localServiceCharge, localServiceChargePercent, extraSplitMode]);

  // keep payers map in sync with participants
  useEffect(() => {
    setPayers((prev) => {
      const next = { ...prev };
      const ids = (confirmedParticipants || []).map((p) => p._id || p.id).filter(Boolean);

      // ensure keys exist
      ids.forEach((id) => {
        if (!next[id]) next[id] = { paying: false, amount: 0 };
      });

      // remove stale ids
      Object.keys(next).forEach((id) => {
        if (!ids.includes(id)) delete next[id];
      });

      // default: if no one selected yet, pick "me" if present, else first participant
      const anyPaying = Object.values(next).some((v) => v.paying);
      if (!anyPaying && ids.length > 0) {
        const meId = (currentUser?._id && ids.includes(currentUser._id)) ? currentUser._id : ids[0];
        Object.keys(next).forEach((k) => (next[k].paying = false));
        next[meId].paying = true;
        // single payer -> we'll treat amount as grandTotal implicitly
        next[meId].amount = grandTotal;
      }
      return next;
    });
  }, [confirmedParticipants, currentUser, grandTotal]);

  const getParticipantPMs = (participantId) => {
    const person = confirmedParticipants.find(p => (p._id || p.id) === participantId);
    const pms = Array.isArray(person?.paymentMethods) ? person.paymentMethods : [];
    // normalize to {paymentMethodId, label}
    return pms.map(pm => ({
      paymentMethodId: pm.paymentMethodId || pm.id || pm._id || pm.token || String(pm.label || pm.type || "Method"),
      label: pm.label || pm.nickname || pm.type || `•••• ${pm.last4 || ""}`.trim(),
    }));
  };

  const setPayerPM = (participantId, paymentMethodId) => {
    setPayers(prev => ({
      ...prev,
      [participantId]: { ...(prev[participantId] || { paying: false, amount: 0 }), paymentMethodId }
    }));
  };

  const payingList = () =>
    Object.entries(payers)
      .filter(([, v]) => v.paying)
      .map(([id, v]) => ({ id, ...v }));
  // Split to 2 decimals; give any leftover cents to the LAST id
  const splitEquallyWithRemainder = (total, ids) => {
    const amounts = {};
    const n = ids.length;
    const totalCents = Math.round(Number(total || 0) * 100);
    if (n <= 0) return amounts;

    const base = Math.floor(totalCents / n);       // floor per person in cents
    const remainder = totalCents - base * n;       // leftover cents (0..n-1)

    for (let i = 0; i < n; i++) {
      amounts[ids[i]] = base / 100;
    }
    // assign ALL leftover cents to the last person (as requested)
    if (remainder > 0) {
      const lastId = ids[n - 1];
      amounts[lastId] = Math.round((amounts[lastId] * 100 + remainder)) / 100;
    }
    return amounts;
  };

  const togglePaying = (id) => {
    setPayers((prev) => {
      const next = { ...prev };
      const was = !!next[id]?.paying;
      next[id] = next[id] || { paying: false, amount: 0, paymentMethodId: next[id]?.paymentMethodId ?? null };
      next[id].paying = !was;

      // keep PM logic as-is...
      if (next[id].paying) {
        const pms = getParticipantPMs(id);
        if (pms.length === 1) next[id].paymentMethodId = pms[0].paymentMethodId;
        if (pms.length > 1 && !pms.some(pm => pm.paymentMethodId === next[id].paymentMethodId)) {
          next[id].paymentMethodId = null;
        }
      }

      // who is paying?
      const activeIds = Object.entries(next).filter(([, v]) => v.paying).map(([pid]) => pid);

      if (activeIds.length === 1) {
        // single payer gets full total
        const soloId = activeIds[0];
        Object.keys(next).forEach((k) => { next[k].amount = 0; });
        next[soloId].amount = grandTotal;
      } else if (activeIds.length > 1) {
        // split equally with rounding residue to LAST active payer
        const map = splitEquallyWithRemainder(grandTotal, activeIds);
        Object.keys(next).forEach((k) => {
          if (activeIds.includes(k)) next[k].amount = map[k];
          else next[k].amount = 0;
        });
      } else {
        // no one paying
        Object.keys(next).forEach((k) => { next[k].amount = 0; });
      }

      return next;
    });
  };



  const setPayAmount = (id, text) => {
    setPayers((prev) => {
      const next = { ...prev };
      const cleaned = String(text).replace(/[^0-9.\-]/g, "");
      const num = cleaned === "" || cleaned === "-" || cleaned === "." ? 0 : Number(cleaned);
      next[id] = next[id] || { paying: false, amount: 0 };
      next[id].amount = isNaN(num) ? 0 : num;
      return next;
    });
  };

  const sumPaid = () =>
    payingList().reduce((s, p) => s + (Number(p.amount) || 0), 0);

  // validation: if multiple payers, enforce exact total; if one payer it's auto OK
  const payersArr = payingList();
  const multiplePayers = payersArr.length > 1;
  const paidHasIssue = multiplePayers && Math.abs(sumPaid() - grandTotal) > 0.01;

  // NEW: ensure each active payer with >1 PMs has chosen one
  const pmMissingForActivePayer = payersArr.some(p => {
    const pms = getParticipantPMs(p.id);
    return pms.length > 1 && !p.paymentMethodId;
  });

  function uniqById(arr = []) {
    const seen = new Set();
    return arr.filter((x) => {
      const id = x?._id ?? x?.id;
      if (!id) return false;
      if (seen.has(id)) return false;
      seen.add(id);
      return true;
    });
  }

  // NEW: participant id array helper
  const getConfirmedParticipantIds = () => {
    return (confirmedParticipants || [])
      .map((p) => p._id || p.id)
      .filter(Boolean);
  };

  // NEW: apply default consumers to all items (used after parse / confirm)
  const assignAllItemsToParticipants = () => {
    const pids = getConfirmedParticipantIds();
    if (pids.length === 0 || editingItems.length === 0) return;

    setEditingItems((prev) =>
      prev.map((it) => {
        const cur = Array.isArray(it.consumers) ? it.consumers : [];
        // if nothing assigned yet, assign everyone by default
        if (!cur.length) return { ...it, consumers: [...pids] };
        return it;
      })
    );
  };
  // add a local saving state (near other states)
  const [saving, setSaving] = useState(false);

  // helper: robust to number-ish inputs
  const toNum = (v) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  };

  // Build splits array from current UI state
  const buildSplitsForPayload = () => {
    const rows = [];
    confirmedParticipants.forEach((p) => {
      const id = p._id || p.id;
      const s = splits.participantTotals[id] || { total: 0 };
      const payer = payers[id] || { paying: false, amount: 0, paymentMethodId: null };

      // everyone "owes" their computed share (0 for none)
      const oweAmount = toNum(s.total);

      // only include a row if they owe or pay (matches your filter in handleSubmit)
      if (oweAmount > 0 || payer.paying) {
        rows.push({
          friendId: id,
          owing: oweAmount > 0,
          paying: !!payer.paying,
          oweAmount,
          owePercent: null, // we’re using absolute split here
          payAmount: multiplePayers ? toNum(payer.amount) : (payer.paying ? grandTotal : 0),
          paymentMethodId: payer.paymentMethodId ?? p.selectedPaymentMethodId ?? null,
        });
      }
    });
    return rows;
  };

  // REPLACE finalizeAndClose with this:
  const finalizeAndClose = async () => {
    if (saving) return;

    try {
      setSaving(true);

      // 1) Build participant splits from current UI state
      const baseSplits = buildSplitsForPayload();
      const normalizedSplits = normalizeOwesToAmount(baseSplits, grandTotal);

      // 2) Build a final parsed snapshot that reflects user edits (tax/tip/service/subtotal/total)
      const effectiveService = Number(effectiveServiceChargeAmount() ?? 0);
      const parsedSnapshot = {
        rawText: serverParsed?.rawText ?? null,
        items: Array.isArray(serverParsed?.items) ? serverParsed.items : [],
        subtotal: subtotal(),
        tax: Number(serverParsed?.tax ?? 0),
        taxBreakdown: serverParsed?.taxBreakdown ?? null,
        serviceCharge: effectiveService,
        serviceChargePercent: serverParsed?.serviceChargePercent ?? null,
        tip: Number(serverParsed?.tip ?? 0),
        discount: Number(serverParsed?.discount ?? 0),
        totalAmount: grandTotal,
        currency: serverParsed?.currency ?? "INR",
        date: serverParsed?.date || null,
        merchant: serverParsed?.merchant ?? null,
        category: serverParsed?.category ?? null,
        notes: serverParsed?.notes ?? null,
      };

      // 3) Expense payload
      const payload = {
        description: serverParsed?.description || serverParsed?.merchant?.name || "Receipt",
        amount: Number(grandTotal),
        category: serverParsed?.category || "default",
        mode: "split",
        splitMode: "value",
        typeOf: "expense",
        date: serverParsed?.date || new Date().toISOString(),
        currency: serverParsed?.currency || "INR",
        ...(selectedGroup?._id ? { groupId: selectedGroup._id } : {}),
        splits: normalizedSplits,
        // Attach receipt + parsing metadata so backend can persist/audit
        ...(receiptMeta
          ? {
            receipt: {
              receiptId: receiptMeta.receiptId ?? null,
              storage: receiptMeta.file ? "s3" : null,
              file: receiptMeta.file ?? null, // { bucket, key, url, contentType, size }
              model: receiptMeta.model ?? null,
              paidUser: receiptMeta.paidUser ?? null,
              token_estimate: receiptMeta.token_estimate ?? null,
              processing_ms: receiptMeta.processing_ms ?? null,
              extraSplitMode, // "proportional" | "equal"
              parsed: parsedSnapshot,
            },
          }
          : {}),
      };

      // 4) Send to backend
      await createExpense(payload, user?.token);

      // 5) Success UX
      try {
        innerRef?.current?.dismiss?.();
      } catch { }
      resetAll();
      Alert.alert("Success", "Expense saved.");
    } catch (e) {
      Alert.alert("Error", e?.message || "Failed to create expense.");
    } finally {
      setSaving(false);
    }
  };


  const renderFooter = ({ busy, primaryDisabled, defaultLayout } = {}) => {
    // Preview footer: Choose another | Upload & Parse
    if (stage === "preview") {
      return (
        <View style={{ flexDirection: "row", gap: 10, alignItems: "center" }}>
          {!uploading && <TouchableOpacity
            style={styles.smallBtn}
            onPress={() => { setStage("choose"); setLocalImage(null); }}
            disabled={uploading}
          >
            {uploading ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>Remove</Text>}
          </TouchableOpacity>}

          <View style={{ flex: 1 }} />

          <TouchableOpacity
            style={[styles.smallBtnPrimary, (uploading || !localImage) && styles.actionBtnDisabled]}
            onPress={() => localImage && uploadImageToServer(localImage.uri)}
            disabled={uploading || !localImage}
          >
            {uploading ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnTextPrimary}>Upload</Text>}
          </TouchableOpacity>
        </View>
      );
    }

    // Picking footer: Cancel | Confirm
    if (stage === "picking") {
      return (
        <View style={{ flexDirection: "row", gap: 10, alignItems: "center" }}>
          <View style={{ flex: 1 }} />
          <TouchableOpacity
            style={[styles.actionBtnSmall, (!selectedFriend && !selectedGroup) && styles.actionBtnDisabled]}
            onPress={onConfirmSelection}
            disabled={!selectedFriend && !selectedGroup}
          >
            <Text style={{ color: "#fff", fontWeight: "700" }}>Confirm</Text>
          </TouchableOpacity>
        </View>
      );
    }


    // Parsed footer
    if (stage === "parsed") {
      const disableSave = !allItemsAssigned || paidHasIssue || payersArr.length === 0 || pmMissingForActivePayer;
      return (
        <View style={{ flexDirection: "row", gap: 10, justifyContent: "flex-end" }}>
          <TouchableOpacity
            style={[styles.actionBtn, disableSave && styles.actionBtnDisabled]}
            onPress={onUseParsedWithConfirm}
            disabled={disableSave}
          >
            <Text style={{ color: "#fff", fontWeight: "700", paddingHorizontal: 16 }}>
              {!allItemsAssigned
                ? "Assign all items"
                : paidHasIssue
                  ? "Fix paid amounts"
                  : pmMissingForActivePayer
                    ? "Choose payment methods"
                    : "Save Expense"}
            </Text>
          </TouchableOpacity>
        </View>
      );
    }



    // Default: empty footer (choose stage)
    return (
      <View style={{ flexDirection: "row", gap: 10, alignItems: "center" }}>
        <View style={{ flex: 1 }} />
      </View>
    );
  };
  // ---------- main render ----------
  return (
    <BottomSheetLayout
      innerRef={innerRef}
      title="Scan Receipt"
      onClose={() => { onClose?.(); resetAll(); }}
      renderFooter={renderFooter}
      hideFooter={false}
    >
      <KeyboardAwareScrollView style={styles.container} contentContainerStyle={{ paddingBottom: insets.bottom + 24 }} keyboardShouldPersistTaps="handled">
        {/* Choose (unchanged) */}
        {stage === "choose" && (
          // ...unchanged...
          <View style={{ marginTop: 12 }}>
            <Text style={styles.sectionLabel}>Scan a receipt</Text>
            <View style={{ flexDirection: "row", gap: 12, marginTop: 12 }}>
              <TouchableOpacity style={styles.largeBtn} onPress={pickFromCamera}>
                <Text style={styles.largeBtnText}>Use Camera</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.largeBtn, styles.largeBtnAlt]} onPress={pickFromGallery}>
                <Text style={[styles.largeBtnText, styles.largeBtnTextAlt]}>Upload Image</Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.helperSmall}>Tip: use good lighting and lay the receipt flat.</Text>
          </View>
        )}

        {/* Preview (unchanged visual) */}
        {stage === "preview" && localImage && (
          <View style={{ marginTop: 12 }}>
            <Text style={styles.sectionLabel}>Preview</Text>
            <Image source={{ uri: localImage.uri }} style={[styles.preview, { height: previewHeight }]} resizeMode="cover" />
          </View>
        )}

        {/* Picking (unchanged + loader text) */}
        {stage === "picking" && (
          // ...unchanged...
          <View style={{ marginTop: 12 }}>
            <Text style={styles.sectionLabel}>Choose one friend or one group</Text>
            <TextInput placeholder="Search friends or groups" placeholderTextColor={colors.muted ?? "#999"} value={searchQ} onChangeText={setSearchQ} style={[styles.input, { marginTop: 8 }]} />
            <Text style={{ marginTop: 12, fontSize: 13, fontWeight: "600", color: colors.text }}>Groups</Text>
            <View style={{ marginTop: 8 }}>
              {filteredGroups.length === 0 ? <Text style={styles.helperSmall}>No groups</Text> : (
                <FlatList data={filteredGroups} keyExtractor={(g) => g._id || g.id || g.name} renderItem={({ item }) => <GroupRow g={item} />} ItemSeparatorComponent={() => <View style={{ height: 8 }} />} scrollEnabled={false} />
              )}
            </View>
            <Text style={{ marginTop: 12, fontSize: 13, fontWeight: "600", color: colors.text }}>Friends</Text>
            <View style={{ marginTop: 8 }}>
              {filteredFriends.length === 0 ? <Text style={styles.helperSmall}>No friends</Text> : (
                <FlatList data={filteredFriends} keyExtractor={(f) => f._id || f.id || f.name} renderItem={({ item }) => <FriendRow f={item} />} ItemSeparatorComponent={() => <View style={{ height: 8 }} />} scrollEnabled={false} />
              )}
            </View>
            <View style={{ marginTop: 16 }}>
              <Text style={styles.helperSmall}>{parsingPending ? "Parsing — you may confirm selection while it runs." : "Select one friend or group to continue."}</Text>
              {parsingPending && <ActivityIndicator style={{ marginTop: 12 }} size="large" />}
            </View>
          </View>
        )}

        {/* Loading */}
        {stage === "loading" && (
          <View style={{ marginTop: 24, alignItems: "center" }}>
            <ActivityIndicator size="large" />
            <Text style={[styles.helperSmall, { marginTop: 12 }]}>Processing…</Text>
          </View>
        )}

        {/* Parsed */}
        {stage === "parsed" && serverParsed && (
          <View style={{ marginTop: 12 }}>
            {/* summary (unchanged) */}
            <View style={styles.summaryCard}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                {serverParsed?.merchant?.name && <Text style={{ fontSize: 16, fontWeight: "700", color: colors.text }}>{serverParsed?.merchant?.name ?? "Receipt"}</Text>}
                <Text style={{ fontWeight: "700", color: colors.text }}>
                  {serverParsed?.currency ?? "INR"}{" "}
                  {formatCurrency(
                    subtotal() + Number(serverParsed?.tax ?? 0) + Number(serverParsed?.tip ?? 0) + Number(effectiveServiceChargeAmount() ?? 0)
                  )}
                </Text>
              </View>
              <Text style={[styles.helperSmall, { marginTop: 6 }]}>{serverParsed?.date ? new Date(serverParsed.date).toLocaleDateString() : ""}</Text>
              <Text style={[styles.helperSmall, { marginTop: 4 }]}>{serverParsed?.category ?? ""}</Text>
            </View>

            {/* Items */}
            <View style={{ marginTop: 12 }}>
              <Text style={{ fontSize: 13, fontWeight: "600", color: colors.text }}>Line items</Text>

              {editingItems.length === 0 ? (
                <Text style={[styles.helperSmall, { marginTop: 8 }]}>No items detected. Add manually if needed.</Text>
              ) : (
                <View style={{ marginTop: 8 }}>
                  {editingItems.map((it) => {
                    const inEdit = editingItemId === it.id;
                    const assignedCount = Array.isArray(it.consumers) ? it.consumers.length : 0;
                    return (
                      <View key={it.id} style={styles.itemCard}>
                        <View style={{ flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between" }}>
                          <View style={{ flex: 1, marginRight: 12 }}>
                            {inEdit ? (
                              <>
                                <TextInput value={it.name} onChangeText={(t) => setEditingItems((prev) => prev.map((x) => (x.id === it.id ? { ...x, name: t } : x)))} placeholder="Item name" style={[styles.input, { marginBottom: 8 }]} />
                                <TextInput value={String(it.amount)} onChangeText={(t) => setEditingItems((prev) => prev.map((x) => x.id === it.id ? { ...x, amount: t } : x))} placeholder="Amount" keyboardType="decimal-pad" style={[styles.input, { width: 160 }]} />
                                <View style={{ flexDirection: "row", gap: 8, marginTop: 8 }}>
                                  <TouchableOpacity style={[styles.smallBtnPrimary, { paddingVertical: 8, paddingHorizontal: 12 }]} onPress={() => stopEditingItem()}><Text style={styles.btnTextPrimary}>Save</Text></TouchableOpacity>
                                  <TouchableOpacity style={[styles.smallBtn, { paddingVertical: 8, paddingHorizontal: 12 }]} onPress={() => stopEditingItem()}><Text style={styles.btnText}>Cancel</Text></TouchableOpacity>
                                </View>
                              </>
                            ) : (
                              <View style={{ flex: 1, flexDirection: 'column', justifyContent: 'flex-start' }}>
                                <Text style={{ fontSize: 15, fontWeight: "700", color: colors.text }}>{it.name}</Text>
                                <Text style={{ marginTop: 6, fontWeight: "600", color: colors.text }}>{formatCurrency(it.amount)}</Text>
                              </View>
                            )}
                          </View>

                          <View style={{ width: 150, alignItems: "flex-end", flexDirection: 'column', gap: 2 }}>
                            <TouchableOpacity style={[styles.neutralBtn]} onPress={() => openConsumersModal(it)}>
                              <Text style={{ fontWeight: "600", fontSize: 13, color: colors.text }}>{assignedCount === 0 ? "Assign people" : `${assignedCount} selected`}</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={[styles.neutralBtn2]} onPress={() => startEditingItem(it.id)} disabled={inEdit}>
                              <Edit width={16} height={16} stroke={theme.colors.muted} />
                            </TouchableOpacity>
                          </View>
                        </View>
                      </View>
                    );
                  })}
                </View>
              )}
            </View>

            {/* NEW: Edit totals toggle button */}
            <View style={{ marginTop: 6, alignItems: "flex-end" }}>
              <TouchableOpacity onPress={() => setEditTotalsOpen((v) => !v)} style={[styles.neutralBtn]}>
                <Text style={styles.pillText}>{editTotalsOpen ? "Hide totals editor" : "Edit totals"}</Text>
              </TouchableOpacity>
            </View>

            {/* NEW: totals editor */}
            {editTotalsOpen && (
              <View style={{ marginTop: 0 }}>
                <View style={{ marginTop: 0, gap: 8 }}>
                  <View style={{ flexDirection: "row", gap: 8 }}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.helperSmall}>Tax</Text>
                      <TextInput
                        value={String(serverParsed?.tax ?? "")}
                        onChangeText={(t) => setServerParsed((p) => ({ ...p, tax: Number(t || 0) }))}
                        keyboardType="decimal-pad"
                        style={styles.input}
                        placeholder="0"
                      />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.helperSmall}>Tip</Text>
                      <TextInput
                        value={String(serverParsed?.tip ?? "")}
                        onChangeText={(t) => setServerParsed((p) => ({ ...p, tip: Number(t || 0) }))}
                        keyboardType="decimal-pad"
                        style={styles.input}
                        placeholder="0"
                      />
                    </View>
                  </View>
                  <View style={{ flexDirection: "row", gap: 8 }}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.helperSmall}>Service Charge</Text>
                      <TextInput
                        value={localServiceCharge == null ? "" : String(localServiceCharge)}
                        onChangeText={setLocalServiceCharge}
                        keyboardType="decimal-pad"
                        style={styles.input}
                        placeholder="0"
                      />
                    </View>
                    {/* <View style={{ width: 140 }}>
                      <Text style={styles.helperSmall}>Service (%)</Text>
                      <TextInput
                        value={localServiceChargePercent == null ? "" : String(localServiceChargePercent)}
                        onChangeText={setLocalServiceChargePercent}
                        keyboardType="decimal-pad"
                        style={styles.input}
                        placeholder="0"
                      />
                    </View> */}
                  </View>
                </View>
              </View>
            )}

            {/* Totals & split mode (dropdown) */}
            <View style={{ marginTop: 16, paddingBottom: 8 }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                <Text style={{ color: colors.muted ?? "#666" }}>Subtotal</Text>
                <Text style={{ fontWeight: "700", color: colors.text }}>{formatCurrency(subtotal())}</Text>
              </View>
              <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 6 }}>
                <Text style={{ color: colors.muted ?? "#666" }}>Tax</Text>
                <Text style={{ fontWeight: "700", color: colors.text }}>{formatCurrency(serverParsed?.tax ?? 0)}</Text>
              </View>
              <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 6 }}>
                <Text style={{ color: colors.muted ?? "#666" }}>Service charge</Text>
                <Text style={{ fontWeight: "700", color: colors.text }}>{formatCurrency(effectiveServiceChargeAmount() ?? 0)}</Text>
              </View>
              <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 6 }}>
                <Text style={{ color: colors.muted ?? "#666" }}>Tip</Text>
                <Text style={{ fontWeight: "700", color: colors.text }}>{formatCurrency(serverParsed?.tip ?? 0)}</Text>
              </View>
              <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 8, alignItems: "center" }}>
                <Text style={{ color: colors.muted ?? "#666" }}>Grand total</Text>
                <Text style={{ fontWeight: "900", color: colors.text, fontSize: 16 }}>
                  {formatCurrency(subtotal() + Number(serverParsed?.tax ?? 0) + Number(serverParsed?.tip ?? 0) + Number(effectiveServiceChargeAmount() ?? 0))}
                </Text>
              </View>
            </View>

            {/* NEW: split mode dropdown row */}
            <View style={{ paddingTop: 8, borderTopWidth: 1, borderTopColor: colors.border || "#eee", }}>
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                <Text style={{ fontSize: 13, fontWeight: "500", color: colors.muted }}>Split tax, service charge and tip</Text>
                <View style={{ width: 120 }}>
                  <Dropdown
                    value={extraSplitMode}
                    onChange={(v) => setExtraSplitMode(v)}
                    options={[
                      { value: "proportional", label: "In Ratio" },
                      { value: "equal", label: "Equally" },
                    ]}
                    placeholder="Choose…"
                    align="right"
                  />
                </View>
              </View>
            </View>


            <View style={{ marginTop: 8, borderTopWidth: 1, borderTopColor: colors.border || "#eee" }}>
              {confirmedParticipants.length === 0 ? (
                <Text style={[styles.helperSmall, { marginTop: 8 }]}>No participants selected.</Text>
              ) : (
                <View style={{ marginTop: 8 }}>
                  {confirmedParticipants.map((p) => {
                    const id = p._id || p.id;
                    const t =
                      splits.participantTotals[id] || {
                        itemShare: 0,
                        taxShare: 0,
                        serviceShare: 0,
                        tipShare: 0,
                        total: 0,
                      };
                    const label = p._id === currentUser?._id ? `${p.name}` : p.name;

                    return (
                      <View
                        key={id}
                        style={{
                          flexDirection: "row",
                          alignItems: "flex-start",
                          paddingVertical: 8,
                        }}
                      >
                        {/* LEFT: label + breakdown */}
                        <View style={{ flex: 1, flexShrink: 1, minWidth: 0, paddingRight: 12 }}>
                          <Text style={{ fontWeight: "700", color: colors.text }}>{label}</Text>
                          <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
                            <Text style={styles.helperSmall}>Items: {formatCurrency(t.itemShare)}• </Text>
                            <Text style={styles.helperSmall}>Tax: {formatCurrency(t.taxShare)} •</Text>
                            <Text style={styles.helperSmall}>Service: {formatCurrency(t.serviceShare)} • </Text>
                            <Text style={styles.helperSmall}>Tip: {formatCurrency(t.tipShare)}</Text>

                          </View>
                        </View>

                        {/* RIGHT: total, pinned right */}
                        <View style={{ flexShrink: 0, alignItems: "flex-end" }}>
                          <Text style={{ fontWeight: "800", color: colors.text }}>
                            {formatCurrency(t.total)}
                          </Text>
                        </View>
                      </View>
                    );
                  })}
                </View>
              )}
            </View>
            {/* Who paid */}
            <View style={{ marginTop: 12, borderTopWidth: 1, borderTopColor: colors.border || "#eee", paddingTop: 12 }}>
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                <Text style={{ fontSize: 13, fontWeight: "700", color: colors.text }}>Who paid?</Text>
                <Text style={[styles.helperSmall, { marginTop: 0 }]}>
                  {multiplePayers ? "Enter amounts for each payer" : "Select the payer"}
                </Text>
              </View>

              <View style={{ marginTop: 8 }}>
                {confirmedParticipants.map((p) => {
                  const id = p._id || p.id;
                  const info = payers[id] || { paying: false, amount: 0 };
                  const active = !!info.paying;
                  const isMe = id === currentUser?._id;
                  const label = isMe ? `${p.name}` : p.name;

                  return (
                    <TouchableOpacity
                      key={`payer-${id}`}
                      activeOpacity={0.8}
                      onPress={() => togglePaying(id)}
                      style={{
                        paddingVertical: 8,
                        flexDirection: "row",
                        alignItems: "center",
                      }}
                    >
                      {/* radio */}
                      <View style={styles.radioWrap}>
                        <View style={[styles.radioOuter, active && styles.radioOuterActive]}>
                          <View style={active ? styles.radioInnerActive : styles.radioInner} />
                        </View>
                      </View>

                      {/* name (wrap) */}
                      <View style={{ flex: 1, flexShrink: 1, minWidth: 0, paddingRight: 8 }}>
                        <Text style={{ color: colors.text, fontWeight: "600" }}>{label}</Text>
                      </View>

                      {/* amount input only when multiple payers & this one active */}
                      {/* right side: PM dropdown (if many) + amount (if multi-payers) */}
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                        {(() => {
                          const pms = getParticipantPMs(id);
                          if (active && pms.length > 1) {
                            return (
                              <View style={{}}>
                                <Dropdown
                                  value={info.paymentMethodId || undefined}
                                  onChange={(val) => setPayerPM(id, val)}
                                  options={pms.map(pm => ({ value: pm.paymentMethodId, label: pm.label }))}
                                  placeholder="Method…"
                                  align="right"
                                  style={{ width: 90 }}
                                />
                              </View>
                            );
                          }
                          if (active && pms.length === 1 && !info.paymentMethodId) {
                            // auto fill single option for consistency
                            setTimeout(() => setPayerPM(id, pms[0].paymentMethodId), 0);
                          }
                          return null;
                        })()}

                        {multiplePayers && active ? (
                          <TextInput
                            placeholder="0.00"
                            keyboardType="decimal-pad"
                            value={String(info.amount ?? "")}
                            onChangeText={(v) => setPayAmount(id, v)}
                            style={[styles.input, { minWidth: 90, textAlign: "right" }]}
                            placeholderTextColor={colors.muted}
                          />
                        ) : null}
                      </View>

                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* helper / validation */}
              <View style={{ marginTop: 6 }}>
                {multiplePayers ? (
                  <Text style={[styles.helperSmall, { color: paidHasIssue ? "#E53935" : colors.muted }]}>
                    {paidHasIssue
                      ? `Amounts mismatch: ${sumPaid().toFixed(2)} / ${grandTotal.toFixed(2)}`
                      : `Total: ${sumPaid().toFixed(2)} / ${grandTotal.toFixed(2)}`}
                  </Text>
                ) : (
                  <Text style={styles.helperSmall}>
                    Grand total: {grandTotal.toFixed(2)}
                  </Text>
                )}
              </View>
            </View>


          </View>
        )}

        <View style={{ height: 24 }} />
      </KeyboardAwareScrollView>

      {/* Consumers modal */}
      <Modal visible={consumersModalVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            {/* header with close button */}
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <Text style={{ fontSize: 16, fontWeight: "700", color: colors.text }}>Assign people</Text>
              <TouchableOpacity onPress={closeConsumersModal} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Text style={{ fontSize: 20, lineHeight: 20, color: colors.text }}>✕</Text>
              </TouchableOpacity>
            </View>

            <Text style={[styles.helperSmall, { marginTop: 6, marginBottom: 8 }]}>Tap to toggle for this item.</Text>

            <ScrollView style={{ maxHeight: 280 }}>
              {confirmedParticipants.length === 0 ? (
                <Text style={styles.helperSmall}>No participants available. Confirm a friend or group first.</Text>
              ) : (
                confirmedParticipants.map((p) => {
                  const id = p._id || p.id;
                  const curConsumers = currentItemForModal ? (currentItemForModal.consumers || []) : [];
                  const active = currentItemForModal ? curConsumers.includes(id) : false;
                  const label = p._id === currentUser?._id ? `${p.name}` : p.name;
                  return (
                    <TouchableOpacity
                      key={id}
                      onPress={() => toggleParticipantForCurrentModal(id)}
                      style={[styles.rowItem, { marginBottom: 8, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }]}
                    >
                      <Text style={styles.rowText}>{label}</Text>
                      {/* right-side ring/tick */}
                      <View style={[styles.checkWrap, active ? styles.checkWrapActive : null]}>
                        {active && <Text style={styles.checkTick}>✓</Text>}
                      </View>
                    </TouchableOpacity>
                  );
                })
              )}
            </ScrollView>

            <View style={{ flexDirection: "row", justifyContent: "flex-end", gap: 8, marginTop: 12 }}>
              <TouchableOpacity style={[styles.smallBtn]} onPress={closeConsumersModal}><Text style={styles.btnText}>Done</Text></TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </BottomSheetLayout>
  );
};


export default ScanReceiptSheet;

/* ---------------- Styles ----------------- */
const createStyles = (colors = {}, theme) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.card ?? "#fff" },
    sectionLabel: { color: colors.cta ?? colors.primary ?? "#00C49F", fontSize: 12, letterSpacing: 1, marginVertical: 8, textTransform: "uppercase" },

    largeBtn: { flex: 1, borderRadius: 12, paddingVertical: 16, alignItems: "center", justifyContent: "center", backgroundColor: colors.cta ?? colors.primary ?? "#00C49F" },
    largeBtnAlt: { backgroundColor: colors.cardMid ?? colors?.cardAlt ?? "#f4f4f4", borderWidth: 1, borderColor: colors.border ?? "#ddd" },
    largeBtnText: { color: "#fff", fontWeight: "700", fontSize: 16 },
    largeBtnTextAlt: { color: colors.text, fontWeight: "700", fontSize: 16 },

    preview: { width: "100%", borderRadius: 8, backgroundColor: "#f4f4f4" },

    smallBtn: { paddingVertical: 10, paddingHorizontal: 12, borderRadius: 8, backgroundColor: colors.cardMid ?? colors?.cardAlt ?? "#f4f4f4" },
    smallBtnPrimary: { paddingVertical: 10, paddingHorizontal: 12, borderRadius: 8, backgroundColor: colors.cta ?? colors.primary ?? "#00C49F" },
    btnText: { color: colors.text ?? "#111", fontWeight: "600" },
    btnTextPrimary: { color: "#fff", fontWeight: "700" },

    helperSmall: { fontSize: 12, color: colors.muted ?? "#666", marginTop: 8 },
    input: { borderWidth: 1, borderColor: colors.border, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, backgroundColor: colors.input ?? "#fff", color: colors.text },

    rowItem: { paddingVertical: 12, paddingHorizontal: 12, borderRadius: 8, backgroundColor: colors?.cardMid ?? colors?.cardAlt, borderWidth: 1, borderColor: colors.border },
    rowItemActive: { backgroundColor: colors.cta ?? "#00C49F" },
    rowText: { color: colors.text },
    rowTextActive: { color: "#fff" },

    summaryCard: { borderWidth: 1, borderColor: colors.border || "#eee", borderRadius: 12, padding: 12, backgroundColor: colors.cardMid ?? colors?.cardAlt ?? "#fff", marginTop: 8 },

    itemCard: { borderWidth: 1, borderColor: colors.border || "#eee", borderRadius: 10, padding: 12, marginBottom: 10, backgroundColor: colors.cardMid ?? colors?.cardAlt ?? "#fff", shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 2 },

    neutralBtn: { paddingVertical: 6, paddingHorizontal: 8, borderRadius: 8, borderWidth: 1, borderColor: theme?.mode == 'dark' ? colors.border : colors.text, backgroundColor: colors.cardMid ?? colors?.cardAlt },
    neutralBtn2: { paddingVertical: 6, paddingHorizontal: 6, marginBottom: -4 },

    pill: { backgroundColor: "#fff", paddingHorizontal: 10, paddingVertical: 6, borderRadius: 16, borderWidth: 1, borderColor: "#eee" },
    pillText: { fontSize: 12, color: colors.text },

    actionBtn: { backgroundColor: colors.cta ?? colors.primary ?? "#00C49F", paddingVertical: 12, borderRadius: 10, alignItems: "center" },
    actionBtnAlt: { backgroundColor: colors.cardMid ?? colors?.cardAlt ?? "#f4f4f4", paddingVertical: 12, borderRadius: 10, alignItems: "center" },
    actionBtnSmall: { backgroundColor: colors.cta ?? colors.primary ?? "#00C49F", paddingVertical: 8, paddingHorizontal: 12, borderRadius: 8 },
    actionBtnDisabled: { opacity: 0.5 },

    modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "center", alignItems: "center", padding: 20 },
    modalCard: { width: "100%", maxWidth: 680, backgroundColor: colors.card, borderRadius: 12, padding: 16 },
    dropdownTrigger: {
      borderWidth: 1, borderColor: "#eee", borderRadius: 10,
      paddingHorizontal: 12, paddingVertical: 10,
      backgroundColor: "#fff", flexDirection: "row",
      alignItems: "center", justifyContent: "space-between"
    },
    dropdownMenu: {
      marginTop: 6, borderWidth: 1, borderColor: "#eee", borderRadius: 10, overflow: "hidden",
      backgroundColor: "#fff"
    },
    dropdownItem: { paddingVertical: 10, paddingHorizontal: 12 },
    dropdownItemActive: { backgroundColor: "#eef8f4" },
    dropdownItemText: { fontWeight: "600" },
    dropdownItemTextActive: { fontWeight: "800" },

    checkWrap: {
      width: 22, height: 22, borderRadius: 11, alignItems: "center", justifyContent: "center",
      borderWidth: 2, borderColor: "#bbb",
    },
    checkWrapActive: { borderColor: colors.cta ?? colors.primary ?? "#00C49F", },
    checkTick: { fontSize: 14, fontWeight: "800", color: colors.primary },
    checkRing: { width: 10, height: 10, borderRadius: 5, borderWidth: 2, borderColor: "#bbb" },
    radioWrap: { width: 28, height: 28, alignItems: "center", justifyContent: "center", marginRight: 8 },
    radioOuter: { width: 18, height: 18, borderRadius: 9, borderWidth: 2, borderColor: colors.border || "#ccc", alignItems: "center", justifyContent: "center" },
    radioOuterActive: { borderColor: colors.cta || "#00C49F" },
    radioInner: { width: 10, height: 10, borderRadius: 5, backgroundColor: "transparent" },
    radioInnerActive: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.cta || "#00C49F" },
    pmBtn: { paddingVertical: 8, paddingHorizontal: 10, borderRadius: 8, borderWidth: 1, alignItems: "center", justifyContent: "center" },
    pmBtnText: { fontWeight: "600" },

  });
