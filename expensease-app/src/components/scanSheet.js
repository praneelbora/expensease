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
import * as ImagePicker from "expo-image-picker";
import * as ImageManipulator from "expo-image-manipulator";
import { KeyboardAwareScrollView } from "react-native-keyboard-aware-scroll-view";
import { useTheme } from "context/ThemeProvider";
import { useAuth } from "context/AuthContext";
import BottomSheetLayout from "./btmShtHeaderFooter";
import { uploadReceipt } from "../services/ImageService";
import { api } from "../utils/api";
import Edit from "@/accIcons/edit.svg";

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
  const styles = useMemo(() => createStyles(colors), [colors]);

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

  const pollTimerRef = useRef(null);
  const uploadStartRef = useRef(0);

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
      console.log("upload response:", data);

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
      return { id, name: it.name ?? "", amount: Number(it.amount ?? 0), consumers: Array.isArray(it.consumers) ? it.consumers.slice() : [] };
    });
    setEditingItems(normalized);

    // load service charge if provided by server
    setLocalServiceCharge(parsed?.serviceCharge ?? (parsed?.serviceCharge === 0 ? 0 : null));
    setLocalServiceChargePercent(parsed?.serviceChargePercent ?? (parsed?.serviceChargePercent === 0 ? 0 : null));

    if (selectionConfirmed) {
      const participants =
        selectedFriend
          ? uniqById([...(currentUser ? [currentUser] : []), selectedFriend])
          : selectedGroup
          ? uniqById([...(Array.isArray(selectedGroup.members) ? selectedGroup.members : []), ...(currentUser ? [currentUser] : [])])
          : [];
      setConfirmedParticipants(participants);
      setStage("parsed");
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

    // include current user if available
    if (selectedFriend) {
      const participants = uniqById([...(currentUser ? [currentUser] : []), selectedFriend]);
      setConfirmedParticipants(participants);
    } else if (selectedGroup) {
      const members = Array.isArray(selectedGroup.members) ? selectedGroup.members : [];
      const participants = uniqById([...members, ...(currentUser ? [currentUser] : [])]);
      setConfirmedParticipants(participants);
    }

    if (parsingPending || !serverParsed) setStage("loading");
    else setStage("parsed");
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
  }, [editingItems]);

  // computed splits memo
  const splits = useMemo(() => computeSplits(), [editingItems, confirmedParticipants, serverParsed, localServiceCharge, localServiceChargePercent, extraSplitMode]);

  // ---------- finalize ----------
  const finalizeAndClose = () => {
    const finalServiceCharge = effectiveServiceChargeAmount();
    const finalServiceChargePercent = parsedLocalServiceChargePercent();

    const payload = {
      parsed: serverParsed,
      items: editingItems.map((it) => ({
        id: it.id,
        name: it.name,
        amount: Number(it.amount || 0),
        consumers: Array.isArray(it.consumers) && it.consumers.length ? it.consumers : confirmedParticipants.map((p) => p._id),
      })),
      metadata: {
        description: serverParsed?.description ?? "",
        currency: serverParsed?.currency ?? "INR",
        category: serverParsed?.category ?? "",
        date: serverParsed?.date ?? new Date().toISOString(),
        tax: Number(serverParsed?.tax ?? 0),
        tip: Number(serverParsed?.tip ?? 0),
        serviceCharge: finalServiceCharge != null ? Number(finalServiceCharge) : null,
        serviceChargePercent: finalServiceChargePercent != null ? Number(finalServiceChargePercent) : null,
      },
      selection: { friend: selectedFriend, group: selectedGroup, participants: confirmedParticipants },
      jobId,
      calculatedSplits: splits, // include computed breakdown for convenience (contains extraSplitMode)
    };

    if (typeof onParsed === "function") onParsed(payload);
    try {
      innerRef?.current?.dismiss?.();
    } catch (e) {}
    setTimeout(resetAll, 250);
  };

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
    const label = f.isMe ? `${f.name} (You)` : f.name;
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
  const renderFooter = ({ busy, primaryDisabled, defaultLayout } = {}) => {
    // Preview footer: Choose another | Upload & Parse
    if (stage === "preview") {
      return (
        <View style={{ flexDirection: "row", gap: 10, alignItems: "center" }}>
          <TouchableOpacity style={styles.smallBtn} onPress={() => { setStage("choose"); setLocalImage(null); }}>
            <Text style={styles.btnText}>Choose another</Text>
          </TouchableOpacity>

          <View style={{ flex: 1 }} />

          <TouchableOpacity
            style={[styles.smallBtnPrimary, (uploading || !localImage) && styles.actionBtnDisabled]}
            onPress={() => localImage && uploadImageToServer(localImage.uri)}
            disabled={uploading || !localImage}
          >
            {uploading ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnTextPrimary}>Upload & Parse</Text>}
          </TouchableOpacity>
        </View>
      );
    }

    // Picking footer: Cancel | Confirm
    if (stage === "picking") {
      return (
        <View style={{ flexDirection: "row", gap: 10, alignItems: "center" }}>
          <TouchableOpacity style={styles.smallBtn} onPress={() => { resetAll(); innerRef?.current?.dismiss?.(); }}>
            <Text style={styles.btnText}>Cancel</Text>
          </TouchableOpacity>

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

    // Parsed footer: Cancel | Use Parsed Result
    if (stage === "parsed") {
      return (
        <View style={{ flexDirection: "row", gap: 10, alignItems: "center" }}>
          <TouchableOpacity style={styles.smallBtn} onPress={() => { resetAll(); }}>
            <Text style={styles.btnText}>Cancel</Text>
          </TouchableOpacity>

          <View style={{ flex: 1 }} />

          <TouchableOpacity
            style={[styles.actionBtn, { flex: 1 }, !allItemsAssigned && styles.actionBtnDisabled]}
            onPress={onUseParsedWithConfirm}
            disabled={!allItemsAssigned}
          >
            <Text style={{ color: "#fff", fontWeight: "700" }}>{!allItemsAssigned ? "Assign all items" : "Use Parsed Result"}</Text>
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
        {/* Choose */}
        {stage === "choose" && (
          <View style={{ marginTop: 12 }}>
            <Text style={styles.sectionLabel}>Scan a receipt</Text>
            <View style={{ flexDirection: "row", gap: 12, marginTop: 12 }}>
              <TouchableOpacity style={styles.largeBtn} onPress={pickFromCamera}>
                <Text style={styles.largeBtnText}>Take Photo</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.largeBtn, styles.largeBtnAlt]} onPress={pickFromGallery}>
                <Text style={[styles.largeBtnText, styles.largeBtnAltText]}>Upload from device</Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.helperSmall}>Tip: use good lighting and lay the receipt flat.</Text>
          </View>
        )}

        {/* Preview */}
        {stage === "preview" && localImage && (
          <View style={{ marginTop: 12 }}>
            <Text style={styles.sectionLabel}>Preview</Text>
            <Image
              source={{ uri: localImage.uri }}
              style={[styles.preview, { height: previewHeight }]}
              resizeMode="cover"
            />
          </View>
        )}

        {/* Picking */}
        {stage === "picking" && (
          <View style={{ marginTop: 12 }}>
            <Text style={styles.sectionLabel}>Choose one friend or one group</Text>

            <TextInput placeholder="Search friends or groups" placeholderTextColor={colors.muted ?? "#999"} value={searchQ} onChangeText={setSearchQ} style={[styles.input, { marginTop: 8 }]} />

            <Text style={{ marginTop: 12, fontSize: 13, fontWeight: "600" }}>Groups</Text>
            <View style={{ marginTop: 8 }}>
              {filteredGroups.length === 0 ? (
                <Text style={styles.helperSmall}>No groups</Text>
              ) : (
                <FlatList data={filteredGroups} keyExtractor={(g) => g._id || g.id || g.name} renderItem={({ item }) => <GroupRow g={item} />} ItemSeparatorComponent={() => <View style={{ height: 8 }} />} scrollEnabled={false} />
              )}
            </View>

            <Text style={{ marginTop: 12, fontSize: 13, fontWeight: "600" }}>Friends</Text>
            <View style={{ marginTop: 8 }}>
              {filteredFriends.length === 0 ? (
                <Text style={styles.helperSmall}>No friends</Text>
              ) : (
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
            {/* Header summary */}
            <View style={styles.summaryCard}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                <Text style={{ fontSize: 16, fontWeight: "700" }}>{serverParsed?.description ?? "Receipt"}</Text>
                <Text style={{ fontWeight: "700" }}>
                  {serverParsed?.currency ?? "INR"}{" "}
                  {formatCurrency(
                    subtotal() +
                      Number(serverParsed?.tax ?? 0) +
                      Number(serverParsed?.tip ?? 0) +
                      Number(effectiveServiceChargeAmount() ?? 0)
                  )}
                </Text>
              </View>

              <Text style={[styles.helperSmall, { marginTop: 6 }]}>{serverParsed?.date ? new Date(serverParsed.date).toLocaleDateString() : ""}</Text>
              <Text style={[styles.helperSmall, { marginTop: 4 }]}>{serverParsed?.category ?? ""}</Text>

              <View style={{ marginTop: 8, flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
                <View style={styles.pill}><Text style={styles.pillText}>Tax: {formatCurrency(serverParsed?.tax ?? 0)}</Text></View>
                <View style={styles.pill}><Text style={styles.pillText}>Tip: {formatCurrency(serverParsed?.tip ?? 0)}</Text></View>
                <View style={styles.pill}><Text style={styles.pillText}>Service: {formatCurrency(effectiveServiceChargeAmount() ?? 0)}{parsedLocalServiceChargePercent() != null ? ` (${parsedLocalServiceChargePercent()}%)` : ""}</Text></View>
              </View>

              {/* editable small controls for service charge + percent */}
              <View style={{ marginTop: 12, flexDirection: "row", gap: 8, alignItems: "center" }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 12, color: colors.muted ?? "#666", marginBottom: 6 }}>Service charge (amount)</Text>
                  <TextInput
                    placeholder="Amount"
                    value={localServiceCharge == null ? "" : String(localServiceCharge)}
                    onChangeText={(t) => setLocalServiceCharge(t)}
                    keyboardType="decimal-pad"
                    style={styles.input}
                  />
                </View>

                <View style={{ width: 120 }}>
                  <Text style={{ fontSize: 12, color: colors.muted ?? "#666", marginBottom: 6 }}>Percent</Text>
                  <TextInput
                    placeholder="%"
                    value={localServiceChargePercent == null ? "" : String(localServiceChargePercent)}
                    onChangeText={(t) => setLocalServiceChargePercent(t)}
                    keyboardType="decimal-pad"
                    style={styles.input}
                  />
                </View>
              </View>
            </View>

            {/* Items */}
            <View style={{ marginTop: 12 }}>
              <Text style={{ fontSize: 13, fontWeight: "600" }}>Line items</Text>

              {editingItems.length === 0 ? (
                <Text style={[styles.helperSmall, { marginTop: 8 }]}>No items detected. Add manually if needed.</Text>
              ) : (
                <View style={{ marginTop: 8 }}>
                  {editingItems.map((it) => {
                    const inEdit = editingItemId === it.id;
                    const assignedCount = Array.isArray(it.consumers) ? it.consumers.length : 0;
                    return (
                      <View key={it.id} style={styles.itemCard}>
                        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
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
                              <>
                                <Text style={{ fontSize: 15, fontWeight: "600" }}>{it.name}</Text>
                                <Text style={{ marginTop: 6, fontWeight: "700" }}>{formatCurrency(it.amount)}</Text>
                              </>
                            )}
                          </View>

                          <View style={{ width: 150, alignItems: "flex-end" }}>
                            <TouchableOpacity style={[styles.neutralBtn, { marginBottom: 8 }]} onPress={() => openConsumersModal(it)}>
                              <Text style={{ fontWeight: "700" }}>{assignedCount === 0 ? "Assign people" : `${assignedCount} selected`}</Text>
                            </TouchableOpacity>

                            <TouchableOpacity style={[styles.neutralBtn2]} onPress={() => startEditingItem(it.id)} disabled={inEdit}><Edit width={16} height={16} stroke={theme.colors.muted} /></TouchableOpacity>
                          </View>
                        </View>
                      </View>
                    );
                  })}
                </View>
              )}
            </View>

            {/* Totals & actions (visual only - actions are in footer) */}
            <View style={{ marginTop: 16 }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                <Text style={{ color: colors.muted ?? "#666" }}>Subtotal</Text>
                <Text style={{ fontWeight: "700" }}>{formatCurrency(subtotal())}</Text>
              </View>
              <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 6 }}>
                <Text style={{ color: colors.muted ?? "#666" }}>Tax</Text>
                <Text style={{ fontWeight: "700" }}>{formatCurrency(serverParsed?.tax ?? 0)}</Text>
              </View>
              <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 6 }}>
                <Text style={{ color: colors.muted ?? "#666" }}>Service charge</Text>
                <Text style={{ fontWeight: "700" }}>{formatCurrency(effectiveServiceChargeAmount() ?? 0)}</Text>
              </View>
              <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 6 }}>
                <Text style={{ color: colors.muted ?? "#666" }}>Tip</Text>
                <Text style={{ fontWeight: "700" }}>{formatCurrency(serverParsed?.tip ?? 0)}</Text>
              </View>
              <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 8 }}>
                <Text style={{ color: colors.muted ?? "#666" }}>Grand total</Text>
                <Text style={{ fontWeight: "900", fontSize: 16 }}>
                  {formatCurrency(subtotal() + Number(serverParsed?.tax ?? 0) + Number(serverParsed?.tip ?? 0) + Number(effectiveServiceChargeAmount() ?? 0))}
                </Text>
              </View>
            </View>

            {/* Extra-split control */}
            <View style={{ marginTop: 14, borderTopWidth: 1, borderTopColor: colors.border || "#eee", paddingTop: 12 }}>
              <Text style={{ fontSize: 13, fontWeight: "700" }}>Split extra items</Text>
              <Text style={[styles.helperSmall, { marginTop: 6 }]}>Choose how tax / service / tip are split between participants.</Text>

              <View style={{ flexDirection: "row", gap: 8, marginTop: 8 }}>
                <TouchableOpacity
                  onPress={() => setExtraSplitMode("proportional")}
                  style={[styles.smallBtn, extraSplitMode === "proportional" && styles.rowItemActive]}
                >
                  <Text style={[styles.btnText, extraSplitMode === "proportional" && styles.rowTextActive]}>Proportionally</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={() => setExtraSplitMode("equal")}
                  style={[styles.smallBtn, extraSplitMode === "equal" && styles.rowItemActive]}
                >
                  <Text style={[styles.btnText, extraSplitMode === "equal" && styles.rowTextActive]}>Equally</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Per-participant summary */}
            <View style={{ marginTop: 14, borderTopWidth: 1, borderTopColor: colors.border || "#eee", paddingTop: 12 }}>
              <Text style={{ fontSize: 13, fontWeight: "700" }}>Who owes what</Text>
              {confirmedParticipants.length === 0 ? (
                <Text style={[styles.helperSmall, { marginTop: 8 }]}>No participants selected.</Text>
              ) : (
                <View style={{ marginTop: 8 }}>
                  {confirmedParticipants.map((p) => {
                    const id = p._id || p.id;
                    const t = splits.participantTotals[id] || { itemShare: 0, taxShare: 0, serviceShare: 0, tipShare: 0, total: 0 };
                    const label = p._id === currentUser?._id ? `${p.name} (You)` : p.name;
                    return (
                      <View key={id} style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: 8, alignItems: "center" }}>
                        <View>
                          <Text style={{ fontWeight: "700" }}>{label}</Text>
                          <Text style={styles.helperSmall}>
                            Items: {formatCurrency(t.itemShare)} • Tax: {formatCurrency(t.taxShare)} • Service: {formatCurrency(t.serviceShare)} • Tip: {formatCurrency(t.tipShare)}
                          </Text>
                        </View>
                        <Text style={{ fontWeight: "800" }}>{formatCurrency(t.total)}</Text>
                      </View>
                    );
                  })}
                </View>
              )}
            </View>
          </View>
        )}

        <View style={{ height: 24 }} />
      </KeyboardAwareScrollView>

      {/* Consumers modal */}
      <Modal visible={consumersModalVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={{ fontSize: 16, fontWeight: "700" }}>Assign people</Text>
            <Text style={[styles.helperSmall, { marginTop: 6, marginBottom: 8 }]}>Tap names to toggle assignment for this item.</Text>

            <ScrollView style={{ maxHeight: 280 }}>
              {confirmedParticipants.length === 0 ? (
                <Text style={styles.helperSmall}>No participants available. Confirm a friend or group first.</Text>
              ) : (
                confirmedParticipants.map((p) => {
                  const id = p._id || p.id;
                  const curConsumers = currentItemForModal ? (currentItemForModal.consumers || []) : [];
                  const active = currentItemForModal ? curConsumers.includes(id) : false;
                  const label = p._id === currentUser?._id ? `${p.name} (You)` : p.name;
                  return (
                    <TouchableOpacity key={id} onPress={() => toggleParticipantForCurrentModal(id)} style={[styles.rowItem, active && styles.rowItemActive, { marginBottom: 8 }]}>
                      <Text style={[styles.rowText, active && styles.rowTextActive]}>{label}</Text>
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
const createStyles = (colors = {}) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.card ?? "#fff" },
    sectionLabel: { color: colors.cta ?? colors.primary ?? "#00C49F", fontSize: 12, letterSpacing: 1, marginVertical: 8, textTransform: "uppercase" },

    largeBtn: { flex: 1, borderRadius: 12, paddingVertical: 16, alignItems: "center", justifyContent: "center", backgroundColor: colors.cta ?? colors.primary ?? "#00C49F" },
    largeBtnAlt: { backgroundColor: colors.cardAlt ?? "#f4f4f4", borderWidth: 1, borderColor: colors.border ?? "#ddd" },
    largeBtnText: { color: "#fff", fontWeight: "700", fontSize: 16 },

    preview: { width: "100%", borderRadius: 8, backgroundColor: "#f4f4f4" },

    smallBtn: { paddingVertical: 10, paddingHorizontal: 12, borderRadius: 8, backgroundColor: colors.cardAlt ?? "#f4f4f4" },
    smallBtnPrimary: { paddingVertical: 10, paddingHorizontal: 12, borderRadius: 8, backgroundColor: colors.cta ?? colors.primary ?? "#00C49F" },
    btnText: { color: colors.text ?? "#111", fontWeight: "600" },
    btnTextPrimary: { color: "#fff", fontWeight: "700" },

    helperSmall: { fontSize: 12, color: colors.muted ?? "#666", marginTop: 8 },
    input: { borderWidth: 1, borderColor: "#eee", borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, backgroundColor: colors.inputBg ?? "#fff" },

    rowItem: { paddingVertical: 12, paddingHorizontal: 12, borderRadius: 8, backgroundColor: "#fff", borderWidth: 1, borderColor: "#f0f0f0" },
    rowItemActive: { backgroundColor: colors.cta ?? "#00C49F" },
    rowText: { color: "#111" },
    rowTextActive: { color: "#fff" },

    summaryCard: { borderWidth: 1, borderColor: colors.border || "#eee", borderRadius: 12, padding: 12, backgroundColor: colors.cardAlt ?? "#fff", marginTop: 8 },

    itemCard: { borderWidth: 1, borderColor: colors.border || "#eee", borderRadius: 10, padding: 12, marginBottom: 10, backgroundColor: colors.cardAlt ?? "#fff", shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 2 },

    neutralBtn: { paddingVertical: 8, paddingHorizontal: 10, borderRadius: 8, borderWidth: 1, borderColor: "#eee", backgroundColor: "#fff" },
    neutralBtn2: { width: 36, paddingVertical: 8, paddingHorizontal: 8, },

    pill: { backgroundColor: "#fff", paddingHorizontal: 10, paddingVertical: 6, borderRadius: 16, borderWidth: 1, borderColor: "#eee" },
    pillText: { fontSize: 12 },

    actionBtn: { backgroundColor: colors.cta ?? colors.primary ?? "#00C49F", paddingVertical: 12, borderRadius: 10, alignItems: "center" },
    actionBtnAlt: { backgroundColor: colors.cardAlt ?? "#f4f4f4", paddingVertical: 12, borderRadius: 10, alignItems: "center" },
    actionBtnSmall: { backgroundColor: colors.cta ?? colors.primary ?? "#00C49F", paddingVertical: 8, paddingHorizontal: 12, borderRadius: 8 },
    actionBtnDisabled: { opacity: 0.5 },

    modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "center", alignItems: "center", padding: 20 },
    modalCard: { width: "100%", maxWidth: 680, backgroundColor: "#fff", borderRadius: 12, padding: 16 },
  });
