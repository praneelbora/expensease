// components/BottomSheetFriendManager.js
import React, { useState, useEffect, useMemo } from 'react';
import {
    View,
    Text,
    TextInput,
    TouchableOpacity,
    StyleSheet,
    Alert,
    ActivityIndicator,
    FlatList,
    Share,
    Linking,
    Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import MainBottomSheet from './mainBottomSheet';
import {
    sendFriendRequest,
    fetchReceivedRequests,
    fetchSentRequests,
    acceptFriendRequest,
    rejectFriendRequest,
    cancelFriendRequest,
} from 'services/FriendService';
import * as ContactsService from 'services/ContactService';
import { useTheme } from 'context/ThemeProvider';
import { useAuth } from 'context/AuthContext';
import { Ionicons } from '@expo/vector-icons';
import { BottomSheetScrollView } from "@gorhom/bottom-sheet";
import { BottomSheetFlatList } from '@gorhom/bottom-sheet';

/**
 * Updated BottomSheetFriendManager
 * - Normalizes device contacts that may contain single contactHash objects or arrays
 * - Extracts rawValue/type/name/label from contactHash entries into phones/emails/labels
 * - Aggregates server users by user id (merge emails/phones) and avoids duplicate rows
 * - Merges duplicate non-user device contacts (same displayName / name candidate) so phones/emails appear together
 */

const BottomSheetFriendManager = ({ innerRef, apiBase = '', onRedirect }) => {
    const insets = useSafeAreaInsets();
    const { theme } = useTheme();
    const { user } = useAuth();
    const colors = theme?.colors || {};
    const styles = useMemo(() => createStyles(colors), [colors]);

    // UI state
    const [inputValue, setInputValue] = useState('');
    const [saving, setSaving] = useState(false);
    const [incoming, setIncoming] = useState([]);
    const [outgoing, setOutgoing] = useState([]);
    const [loading, setLoading] = useState(true);

    // contacts + server state
    const [scanning, setScanning] = useState(false);
    const [deviceContacts, setDeviceContacts] = useState([]); // enriched device contacts
    const [serverMatches, setServerMatches] = useState([]); // raw matches from server
    const [scanMeta, setScanMeta] = useState({ uploaded: 0, notOnAppCount: 0, skippedCount: 0 });

    const [showRequests, setShowRequests] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');

    /* ---------------- lifecycle ---------------- */
    const pullRequests = async () => {
        try {
            setLoading(true);
            const [receivedResp, sentResp] = await Promise.all([fetchReceivedRequests(), fetchSentRequests()]);
            const received = (receivedResp && (receivedResp.data || receivedResp)) || [];
            const sent = (sentResp && (sentResp.data || sentResp)) || [];
            setIncoming(received || []);
            setOutgoing(sent || []);
        } catch (e) {
            console.warn('Failed to fetch requests:', e);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        (async () => {
            await pullRequests();
            await loadDeviceContactsAndSync();
        })();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    /* ---------------- contacts permission & loading ---------------- */
    const ensureContactsPermission = async () => {
        try {
            const currentPerm = await ContactsService.requestContactsPermission();
            if (currentPerm) return true;

            return await new Promise((resolve) => {
                Alert.alert(
                    'Contacts permission required',
                    'We use your contacts to invite friends and find people you know in Expensease.',
                    [
                        {
                            text: 'Open Settings',
                            onPress: () => {
                                Linking.openSettings().catch(() => {
                                    const url = Platform.OS === 'ios' ? 'app-settings:' : 'package:';
                                    Linking.openURL(url).catch(() => { });
                                });
                                resolve(false);
                            },
                        },
                        {
                            text: 'Try Again',
                            onPress: async () => {
                                try {
                                    const r = await ContactsService.requestContactsPermission();
                                    resolve(!!r);
                                } catch (e) {
                                    console.warn('requestPermissionsAsync error on Try Again:', e);
                                    resolve(false);
                                }
                            },
                        },
                        { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
                    ],
                    { cancelable: true }
                );
            });
        } catch (err) {
            console.warn('Contacts permission check failed:', err);
            return false;
        }
    };

    // Lightweight normalizer for device contact entry shapes
    // It will return an object: { id, displayName, phones:[], emails:[], contactHashes:[string or objects], raw }
    const normalizeDeviceContact = (dc) => {
        // dc might have: displayName, label, phones[], emails[], contactHash (object), contactHashes (array of objects), hashes array
        const out = {
            id: dc?.id || dc?.recordID || Math.random().toString(36).slice(2),
            displayName: dc?.displayName || dc?.label || null,
            phones: [],
            emails: [],
            contactHashes: [], // keep original objects if present
            raw: dc,
        };

        // helper to push deduped
        const add = (set, v) => {
            if (!v) return;
            const s = String(v).trim();
            if (!s) return;
            if (!set.includes(s)) set.push(s);
        };

        // if explicit phones/emails arrays exist
        if (Array.isArray(dc?.phones) && dc.phones.length) {
            for (const p of dc.phones) add(out.phones, p);
        }
        if (Array.isArray(dc?.emails) && dc.emails.length) {
            for (const e of dc.emails) add(out.emails, e);
        }

        // Some contact services return contactHash as object (single) or contactHashes as array of objects:
        // { contactHash: { contactHash, rawValue, type, label, name } } or array of such objects
        const pushHashObj = (hashObj) => {
            if (!hashObj) return;
            // If this hashObj is nested like { contactHash: {...} } then extract inner
            const candidate = hashObj.contactHash ? hashObj.contactHash : hashObj;
            if (!candidate) return;
            // store the hash string if available
            if (candidate.contactHash) out.contactHashes.push(candidate.contactHash);
            else if (candidate.hash) out.contactHashes.push(candidate.hash);
            // extract rawValue and type
            if (candidate.rawValue) {
                if (String(candidate.type || '').toLowerCase().includes('email') || /^\S+@\S+\.\S+$/.test(String(candidate.rawValue))) {
                    add(out.emails, candidate.rawValue);
                } else {
                    add(out.phones, candidate.rawValue);
                }
            } else if (candidate.value) {
                if (String(candidate.type || '').toLowerCase().includes('email') || /^\S+@\S+\.\S+$/.test(String(candidate.value))) {
                    add(out.emails, candidate.value);
                } else {
                    add(out.phones, candidate.value);
                }
            }
        };

        // single object
        if (dc?.contactHash && typeof dc.contactHash === 'object') {
            pushHashObj(dc.contactHash);
        }

        // array of hash objects
        if (Array.isArray(dc?.contactHashes) && dc.contactHashes.length) {
            for (const h of dc.contactHashes) pushHashObj(h);
        }

        // some services store 'hashes' array of strings
        if (Array.isArray(dc?.hashes) && dc.hashes.length) {
            for (const hh of dc.hashes) {
                if (typeof hh === 'string') out.contactHashes.push(hh);
                else if (hh?.contactHash) out.contactHashes.push(hh.contactHash);
            }
        }

        // last resort: if dc has phone/email singular fields
        if (dc?.phone && !out.phones.length) add(out.phones, dc.phone);
        if (dc?.email && !out.emails.length) add(out.emails, dc.email);

        // dedupe contactHashes
        out.contactHashes = Array.from(new Set(out.contactHashes.filter(Boolean)));

        return out;
    };

    /* ---------------- robust contact load + sync ---------------- */
    const loadDeviceContactsAndSync = async () => {
        try {
            setScanning(true);
            const ok = await ensureContactsPermission();
            if (!ok) {
                await loadDeviceContactsOnly();
                setScanning(false);
                return;
            }

            let enriched = [];
            let hashes = [];
            let skippedCount = 0;

            if (typeof ContactsService.getDeviceContacts === 'function') {
                try {
                    const dev = await ContactsService.getDeviceContacts();
                    enriched = Array.isArray(dev) ? dev : [];
                } catch (e) {
                    console.warn('getDeviceContacts failed:', e);
                }
            }

            if ((!enriched || enriched.length === 0) && typeof ContactsService.fetchAndHashContacts === 'function') {
                try {
                    const res = await ContactsService.fetchAndHashContacts({
                        userPhone: (user && user.phone) ? String(user.phone) : null,
                        maxContacts: 2000,
                    });
                    hashes = Array.isArray(res?.hashes) ? res.hashes : [];
                    skippedCount = res?.skippedCount || 0;
                    if (Array.isArray(res?.enrichedContacts) && res.enrichedContacts.length > 0) enriched = res.enrichedContacts;
                } catch (e) {
                    console.warn('fetchAndHashContacts failed:', e);
                }
            }

            // If enriched present but no hashes, attempt hashContacts or extract fields
            if ((!hashes || hashes.length === 0) && Array.isArray(enriched) && enriched.length > 0) {
                if (typeof ContactsService.hashContacts === 'function') {
                    try {
                        const h = await ContactsService.hashContacts(enriched);
                        hashes = Array.isArray(h) ? h : [];
                    } catch (e) {
                        console.warn('hashContacts failed:', e);
                    }
                } else {
                    // try to extract contactHash fields if enriched contains them
                    hashes = enriched
                        .flatMap((c) => {
                            const out = [];
                            if (c?.contactHash && typeof c.contactHash === 'object') {
                                out.push(c.contactHash.contactHash || c.contactHash.hash);
                            }
                            if (Array.isArray(c?.contactHashes)) out.push(...c.contactHashes.map((x) => x?.contactHash || x?.hash).filter(Boolean));
                            if (Array.isArray(c?.hashes)) out.push(...c.hashes.filter(Boolean));
                            return out;
                        })
                        .filter(Boolean);
                }
            }

            // If only hashes exist and no enriched labels, produce minimal enriched so UI shows rows
            if ((!enriched || enriched.length === 0) && hashes.length > 0) {
                enriched = hashes.map((h, i) => ({ id: `h:${i}`, contactHash: h, displayName: null, phones: [], emails: [] }));
            }

            // Normalize device contacts to always have phones/emails arrays and contactHashes
            const normalized = (Array.isArray(enriched) ? enriched : []).map((dc) => normalizeDeviceContact(dc));
            setDeviceContacts(normalized);

            // harvest hashes once again if missing
            if (!hashes || hashes.length === 0) {
                hashes = normalized.flatMap((n) => n.contactHashes || []).filter(Boolean);
            }

            if (!hashes || hashes.length === 0) {
                setServerMatches([]);
                setScanMeta({ uploaded: 0, notOnAppCount: 0, skippedCount });
                setScanning(false);
                return;
            }

            // upload unique hashes
            const uniq = Array.from(new Set(hashes));
            const toUpload = uniq; // <-- remove the old slice(0,2000)

            let resp = await ContactsService.uploadContactHashesBatched(toUpload, { batchSize: 500, concurrency: 1 });
            // if your other code expects resp.data, normalize:
            if (resp && resp.matches !== undefined) {
                // resp is already aggregated result
            } else if (resp && resp.data) {
                resp = resp.data;
            }

            const matches = Array.isArray(resp?.matches) ? resp.matches : [];
            const uploaded = Number.isFinite(resp?.uploaded) ? resp.uploaded : toUpload.length;
            const notOnAppCount = (toUpload.length || 0) - (matches.length || 0);

            // Normalize matches: ensure matchedUsers array exists
            const normalizedMatches = matches.map((m) => ({
                contactHash: m.contactHash,
                matchedUsers: Array.isArray(m.matchedUsers) ? m.matchedUsers : [],
                label: m.label || null,
            }));

            setServerMatches(normalizedMatches);
            setScanMeta({ uploaded, notOnAppCount, skippedCount });
        } catch (err) {
            console.warn('loadDeviceContactsAndSync error', err);
            Alert.alert('Error', err?.message || 'Failed to load contacts');
        } finally {
            setScanning(false);
        }
    };

    const loadDeviceContactsOnly = async () => {
        try {
            let enriched = [];
            if (typeof ContactsService.getDeviceContacts === 'function') {
                const dev = await ContactsService.getDeviceContacts();
                enriched = Array.isArray(dev) ? dev : [];
            } else if (typeof ContactsService.fetchAndHashContacts === 'function') {
                try {
                    const res = await ContactsService.fetchAndHashContacts({ userPhone: null, onlyEnriched: true });
                    enriched = Array.isArray(res?.enrichedContacts) ? res.enrichedContacts : [];
                } catch (e) {
                    console.warn('fetchAndHashContacts(onlyEnriched) failed:', e);
                }
            }
            const normalized = (Array.isArray(enriched) ? enriched : []).map((dc) => normalizeDeviceContact(dc));
            setDeviceContacts(normalized);
        } catch (e) {
            console.warn('loadDeviceContactsOnly error', e);
            setDeviceContacts([]);
        }
    };

    const handleSyncNow = async () => {
        await loadDeviceContactsAndSync();
        await pullRequests();
    };
    /* ---------------- request index maps ---------------- */
    // small helper to canonicalize phone for matching: compare last 10 digits (works for many mobile numbers)
    const phoneKey = (p) => {
        if (!p && p !== 0) return null;
        const digits = String(p).replace(/\D/g, '');
        if (!digits) return null;
        return digits.length > 10 ? digits.slice(-10) : digits;
    };

    const requestMaps = useMemo(() => {
        const incByUser = new Map();    // userId -> incoming req
        const outByUser = new Map();    // userId -> outgoing req
        const incByEmail = new Map();   // email -> incoming req
        const outByEmail = new Map();   // email -> outgoing req
        const incByPhoneKey = new Map();// phoneKey -> incoming req
        const outByPhoneKey = new Map();// phoneKey -> outgoing req

        for (const req of incoming || []) {
            try {
                const sender = req?.sender || {};
                if (sender?._id) incByUser.set(String(sender._id), req);
                if (sender?.email) incByEmail.set(String(sender.email).trim().toLowerCase(), req);
                if (sender?.phone) {
                    const k = phoneKey(sender.phone);
                    if (k) incByPhoneKey.set(k, req);
                }
            } catch (e) { /* ignore malformed request */ }
        }

        for (const req of outgoing || []) {
            try {
                const receiver = req?.receiver || {};
                if (receiver?._id) outByUser.set(String(receiver._id), req);
                if (receiver?.email) outByEmail.set(String(receiver.email).trim().toLowerCase(), req);
                if (receiver?.phone) {
                    const k = phoneKey(receiver.phone);
                    if (k) outByPhoneKey.set(k, req);
                }
            } catch (e) { /* ignore malformed request */ }
        }

        return {
            incByUser, outByUser, incByEmail, outByEmail, incByPhoneKey, outByPhoneKey
        };
    }, [incoming, outgoing]);

    // For an aggregated on-app row, try to find an incoming/outgoing request
    // Returns { type: 'incoming'|'outgoing'|'none', req: requestObject|null }
    const rowRequestForItem = (item) => {
        // only meaningful for rows representing server users
        if (!item) return { type: 'none', req: null };

        // 1) if aggregatedUsers present, prefer matching by server userId(s)
        const aggUsers = Array.isArray(item.aggregatedUsers) ? item.aggregatedUsers : [];
        for (const u of aggUsers) {
            const uid = String(u.userId || u.userId || u.id || u.userId || '').trim();
            if (uid) {
                if (requestMaps.incByUser.has(uid)) return { type: 'incoming', req: requestMaps.incByUser.get(uid) };
                if (requestMaps.outByUser.has(uid)) return { type: 'outgoing', req: requestMaps.outByUser.get(uid) };
            }
        }

        // 2) fallback: match by email (case-insensitive)
        const emails = (item.emails || []).map((e) => String(e).trim().toLowerCase()).filter(Boolean);
        for (const e of emails) {
            if (requestMaps.incByEmail.has(e)) return { type: 'incoming', req: requestMaps.incByEmail.get(e) };
            if (requestMaps.outByEmail.has(e)) return { type: 'outgoing', req: requestMaps.outByEmail.get(e) };
        }

        // 3) fallback: match by phone key (last 10 digits)
        const phones = (item.phones || []).map((p) => phoneKey(p)).filter(Boolean);
        for (const k of phones) {
            if (requestMaps.incByPhoneKey.has(k)) return { type: 'incoming', req: requestMaps.incByPhoneKey.get(k) };
            if (requestMaps.outByPhoneKey.has(k)) return { type: 'outgoing', req: requestMaps.outByPhoneKey.get(k) };
        }

        return { type: 'none', req: null };
    };

    /* ---------------- aggregate server users by user id ---------------- */
    const aggregatedUsersById = useMemo(() => {
        const map = new Map();
        for (const sm of serverMatches || []) {
            for (const u of (sm.matchedUsers || [])) {
                const uid = String(u._id || u.id || u.userId || u.user_id || (u.email || u.phone) || Math.random().toString(36));
                const existing = map.get(uid) || { userId: uid, name: null, emails: new Set(), phones: new Set(), avatar: null, raw: [] };
                if (u.email) existing.emails.add(String(u.email));
                if (u.phone) existing.phones.add(String(u.phone));
                existing.name = existing.name || u.name || u.fullName || u.displayName || null;
                existing.avatar = existing.avatar || u.avatar || u.profilePic || null;
                existing.raw.push({ fromHash: sm.contactHash, rawUser: u });
                map.set(uid, existing);
            }
        }
        // convert sets to arrays for easier use later
        const out = new Map();
        for (const [k, v] of map.entries()) {
            out.set(k, {
                userId: v.userId,
                name: v.name,
                emails: Array.from(v.emails),
                phones: Array.from(v.phones),
                avatar: v.avatar,
                raw: v.raw,
            });
        }
        return out;
    }, [serverMatches]);

    /* ---------------- build unified contact rows (with merging duplicates) ---------------- */
    const buildUnifiedContacts = () => {
        const rows = [];

        // Map contactHash -> serverMatch (for quick lookup)
        const matchByHash = new Map();
        for (const sm of serverMatches || []) if (sm.contactHash) matchByHash.set(sm.contactHash, sm);

        // --- STEP A: Group deviceContacts by a human key (displayName or name candidate)
        const grouped = new Map();

        const extractNameCandidate = (dc) => {
            if (dc.displayName) return String(dc.displayName).trim();
            const raw = dc.raw || {};
            const candidates = [];
            if (raw?.contactHash && raw.contactHash.name) candidates.push(raw.contactHash.name);
            if (Array.isArray(raw?.contactHashes)) {
                for (const ch of raw.contactHashes) {
                    const candidate = ch?.contactHash ? ch.contactHash : ch;
                    if (candidate?.name) candidates.push(candidate.name);
                }
            }
            // fallback to label if present on raw
            if (raw?.label) candidates.push(raw.label);
            // take the first non-empty
            const first = candidates.find(Boolean);
            return first ? String(first).trim() : null;
        };

        for (const dc of deviceContacts || []) {
            const nameCandidate = extractNameCandidate(dc) || dc.displayName || null;
            // Use a group key: lowercased nameCandidate if available, else the first contactHash if exists, else the id
            const keyBase = nameCandidate ? String(nameCandidate).toLowerCase() : (dc.contactHashes && dc.contactHashes[0]) || dc.id;
            const key = String(keyBase).trim();
            if (!grouped.has(key)) {
                grouped.set(key, {
                    ids: new Set([dc.id]),
                    displayName: nameCandidate || dc.displayName || null,
                    phones: new Set(([...dc.phones, dc?.raw?.contactHash?.type == 'phone' ? dc?.raw?.contactHash?.rawValue : []] || []).map((p) => String(p).trim()).filter(Boolean)),
                    emails: new Set(([...dc.emails, dc?.raw?.contactHash?.type == 'email' ? dc?.raw?.contactHash?.rawValue : []] || []).map((e) => String(e).trim()).filter(Boolean)),
                    contactHashes: new Set((dc.contactHashes || []).filter(Boolean)),
                    rawDevices: [dc.raw],
                });
            } else {
                const g = grouped.get(key);
                g.ids.add(dc.id);
                ([...dc.phones, dc?.raw?.contactHash?.type == 'phone' ? dc?.raw?.contactHash?.rawValue : []] || []).forEach((p) => g.phones.add(String(p).trim()));
                ([...dc.emails, dc?.raw?.contactHash?.type == 'email' ? dc?.raw?.contactHash?.rawValue : []] || []).forEach((e) => g.emails.add(String(e).trim()));
                (dc.contactHashes || []).forEach((ch) => g.contactHashes.add(ch));
                g.rawDevices.push(dc.raw);
            }
        }

        // --- STEP B: For each grouped device contact, compute linked server users (if any) and build row
        const addedUserIds = new Set();

        for (const [key, g] of grouped.entries()) {
            const phones = Array.from(g.phones).filter(Boolean);
            const emails = Array.from(g.emails).filter(Boolean);

            // collect server users linked via any of this group's hashes
            const linkedUserIds = new Set();
            for (const h of Array.from(g.contactHashes)) {
                const sm = matchByHash.get(h);
                if (!sm) continue;
                for (const u of sm.matchedUsers || []) {
                    const uid = String(u._id || u.id || u.userId || u.user_id || (u.email || u.phone) || Math.random().toString(36));
                    linkedUserIds.add(uid);
                }
            }

            const aggregatedUsers = [];
            for (const uid of linkedUserIds) {
                const agg = aggregatedUsersById.get(uid);
                if (agg) {
                    aggregatedUsers.push({
                        userId: agg.userId,
                        name: agg.name,
                        emails: agg.emails,
                        phones: agg.phones,
                        avatar: agg.avatar,
                    });
                    // merge server user emails/phones into device-level lists
                    (agg.emails || []).forEach((e) => emails.push(e));
                    (agg.phones || []).forEach((p) => phones.push(p));
                    addedUserIds.add(uid);
                }
            }

            // dedupe final arrays
            // dedupe final arrays
            // dedupe final arrays
            let uniqEmails = Array.from(new Set(emails.filter(Boolean)));
            let uniqPhones = Array.from(new Set(phones.filter(Boolean)));

            const isOnApp = aggregatedUsers.length > 0;

            // --- NEW: hide device contact rows that are fully represented on-server,
            // and remove only the matched elements if partially represented.
            // serverContactSets (phonesSet, emailsSet, phoneKey) is available via outer scope.

            try {
                const serverPhonesSet = (serverContactSets && serverContactSets.phonesSet) || new Set();
                const serverEmailsSet = (serverContactSets && serverContactSets.emailsSet) || new Set();
                const phoneKeyFn = (serverContactSets && serverContactSets.phoneKey) || ((p) => {
                    if (!p && p !== 0) return null;
                    const digits = String(p).replace(/\D/g, '');
                    if (!digits) return null;
                    return digits.length > 10 ? digits.slice(-10) : digits;
                });

                // Helper to test if a single phone/email is present on server
                const phoneIsOnServer = (p) => {
                    const k = phoneKeyFn(p);
                    if (k) return serverPhonesSet.has(k);
                    return serverPhonesSet.has(String(p).trim());
                };
                const emailIsOnServer = (e) => serverEmailsSet.has(String(e).trim().toLowerCase());

                // Count how many device elements are represented on server
                const deviceElements = [...uniqPhones.map((p) => ({ type: 'phone', value: p })), ...uniqEmails.map((e) => ({ type: 'email', value: e }))];
                let matchedCount = 0;
                for (const el of deviceElements) {
                    if (el.type === 'phone' && phoneIsOnServer(el.value)) matchedCount++;
                    if (el.type === 'email' && emailIsOnServer(el.value)) matchedCount++;
                }

                // If all device elements are present on-server, hide this device contact row
                if (deviceElements.length > 0 && matchedCount === deviceElements.length) {
                    // don't push this row - fully duplicated by on-app users
                    continue;
                }

                // Otherwise remove only the matched elements so the row shows only non-server items
                uniqPhones = uniqPhones.filter((p) => !phoneIsOnServer(p));
                uniqEmails = uniqEmails.filter((e) => !emailIsOnServer(e));
            } catch (err) {
                // fail-safe: if anything goes wrong, keep original uniqPhones/uniqEmails
                console.warn('server-filtering failed', err);
            }

            // If after filtering a non-onapp group has no contact points left, skip it.
            if (!isOnApp && uniqPhones.length === 0 && uniqEmails.length === 0) {
                continue; // don't push this row
            }

            // Filter out any phone/email that is already represented by server-side Expensease users.
            // We compare emails lowercased, and phones by last-10-digit key where possible.
            const { phonesSet: serverPhonesSet, emailsSet: serverEmailsSet, phoneKey } = serverContactSets || { phonesSet: new Set(), emailsSet: new Set(), phoneKey: (p) => p };

            if (!isOnApp) {
                uniqPhones = uniqPhones.filter((p) => {
                    try {
                        const k = phoneKey(p);
                        if (k) return !serverPhonesSet.has(k);
                        return !serverPhonesSet.has(String(p).trim());
                    } catch (e) {
                        return true;
                    }
                });

                uniqEmails = uniqEmails.filter((e) => {
                    try {
                        return !serverEmailsSet.has(String(e).trim().toLowerCase());
                    } catch (err) {
                        return true;
                    }
                });

                // If after filtering a non-onapp group has no contact points left, skip it.
                if (uniqPhones.length === 0 && uniqEmails.length === 0) {
                    continue; // don't push this row
                }
            }


            // display name preference
            let displayName = g.displayName;
            if (!displayName && aggregatedUsers.length > 0) {
                displayName = aggregatedUsers.map((u) => u.name).filter(Boolean).join(' / ');
            }
            if (!displayName) {
                // try collect names from raw devices
                const nameCandidates = [];
                for (const raw of g.rawDevices || []) {
                    if (raw?.contactHash && raw.contactHash.name) nameCandidates.push(raw.contactHash.name);
                    if (Array.isArray(raw?.contactHashes)) {
                        for (const ch of raw.contactHashes) {
                            const candidate = ch?.contactHash ? ch.contactHash : ch;
                            if (candidate?.name) nameCandidates.push(candidate.name);
                        }
                    }
                    if (raw?.label) nameCandidates.push(raw.label);
                }
                if (nameCandidates.length) displayName = Array.from(new Set(nameCandidates)).join(' / ');
            }
            if (!displayName) displayName = 'Contact';

            rows.push({
                id: `${Array.from(g.ids).join('|')}::${isOnApp ? 'onapp' : 'invite'}`,
                isOnApp,
                name: displayName,
                emails: uniqEmails,
                phones: uniqPhones,
                label: displayName,
                avatar: aggregatedUsers[0]?.avatar || null,
                aggregatedUsers,
                contactHashes: Array.from(g.contactHashes),
                rawDevice: g.rawDevices[0] || null,
            });
        }

        // 2) Add any aggregated server users that are NOT represented by any device contact
        for (const [uid, agg] of aggregatedUsersById.entries()) {
            if (addedUserIds.has(uid)) continue;
            rows.push({
                id: `srv:${uid}`,
                isOnApp: true,
                name: agg.name || (agg.emails && agg.emails[0]) || (agg.phones && agg.phones[0]) || 'Expensease user',
                emails: agg.emails || [],
                phones: agg.phones || [],
                label: agg.name || (agg.emails || []).join(', ') || (agg.phones || []).join(', '),
                avatar: agg.avatar || null,
                aggregatedUsers: [{ userId: agg.userId, name: agg.name, emails: agg.emails, phones: agg.phones, avatar: agg.avatar }],
                contactHashes: (agg.raw || []).flatMap((r) => r.contactHash ? [r.contactHash] : []).filter(Boolean),
                rawDevice: null,
            });
        }
        // --- POST-PROCESS: remove device rows fully/partially covered by on-app rows ---
        // Put this immediately BEFORE the existing final sort (rows.sort(...))

        const phoneKeyFn = (p) => {
            if (!p && p !== 0) return null;
            const digits = String(p).replace(/\D/g, '');
            if (!digits) return null;
            return digits.length > 10 ? digits.slice(-10) : digits;
        };

        // Collect all phones/emails that already appear in *on-app* rows
        const serverPhonesSetAll = new Set();
        const serverEmailsSetAll = new Set();
        for (const r of rows) {
            if (r.isOnApp) {
                (r.phones || []).forEach((p) => {
                    const k = phoneKeyFn(p);
                    if (k) serverPhonesSetAll.add(k);
                    else serverPhonesSetAll.add(String(p).trim());
                });
                (r.emails || []).forEach((e) => {
                    if (e) serverEmailsSetAll.add(String(e).trim().toLowerCase());
                });
            }
        }

        // Build final list: for non-onApp rows remove matched elements, drop if nothing left
        const finalRows = [];
        for (const r of rows) {
            if (!r.isOnApp) {
                const remainingPhones = (r.phones || []).filter((p) => {
                    const k = phoneKeyFn(p);
                    return k ? !serverPhonesSetAll.has(k) : !serverPhonesSetAll.has(String(p).trim());
                });
                const remainingEmails = (r.emails || []).filter((e) => !serverEmailsSetAll.has(String(e).trim().toLowerCase()));

                // If all device elements are already present on-app, skip this row entirely
                if (remainingPhones.length === 0 && remainingEmails.length === 0) {
                    continue;
                }

                // Keep the row but only with the non-server contact points
                finalRows.push({ ...r, phones: remainingPhones, emails: remainingEmails });
            } else {
                finalRows.push(r);
            }
        }

        // replace rows contents in-place (rows is declared earlier)
        rows.length = 0;
        rows.push(...finalRows);

        // 3) final sort: matched first, then alphabetical
        rows.sort((a, b) => {
            if (a.isOnApp === b.isOnApp) return String((a.name || '')).localeCompare(String((b.name || '')));
            return a.isOnApp ? -1 : 1;
        });

        return rows;
    };

    const unifiedContacts = useMemo(buildUnifiedContacts, [deviceContacts, serverMatches, aggregatedUsersById]);

    /* ---------------- actions ---------------- */
    const handleSendFriendRequestToUser = async (contactRow) => {
        try {
            let target = null;
            if (Array.isArray(contactRow.aggregatedUsers) && contactRow.aggregatedUsers.length > 0) {
                const u = contactRow.aggregatedUsers[0];
                target = (u.emails && u.emails[0]) || (u.phones && u.phones[0]) || null;
            }
            if (!target && Array.isArray(contactRow.emails) && contactRow.emails.length > 0) target = contactRow.emails[0];
            if (!target && Array.isArray(contactRow.phones) && contactRow.phones.length > 0) target = contactRow.phones[0];
            if (!target) return Alert.alert('Unable to add', 'No contact info available to send request.');
            await sendFriendRequest(target);
            await pullRequests();
            Alert.alert('Request sent', 'Friend request sent successfully.');
        } catch (e) {
            Alert.alert('Error', e?.message || 'Failed to send friend request');
        }
    };

    const handleInviteRow = async (contactRow) => {
        try {
            const label = contactRow.label || contactRow.name || 'your friend';
            const shareText = `Join ${label} on Expensease — split bills, settle easily. Download: https://expensease.in`;
            await Share.share({ message: shareText });
        } catch (e) {
            console.warn('Invite failed', e);
        }
    };

    const handleSearchChange = (text) => {
        setInputValue(text);
        setSearchQuery(text);
    };
    // build sets of server-known phones/emails for filtering device-contact rows
    const serverContactSets = useMemo(() => {
        const phonesSet = new Set();
        const emailsSet = new Set();

        const phoneKey = (p) => {
            if (!p && p !== 0) return null;
            const digits = String(p).replace(/\D/g, '');
            if (!digits) return null;
            return digits.length > 10 ? digits.slice(-10) : digits;
        };

        for (const [, agg] of aggregatedUsersById.entries()) {
            (agg.phones || []).forEach((p) => {
                const k = phoneKey(p);
                if (k) phonesSet.add(k);
                else if (p) phonesSet.add(String(p).trim());
            });
            (agg.emails || []).forEach((e) => {
                if (e) emailsSet.add(String(e).trim().toLowerCase());
            });
        }

        return { phonesSet, emailsSet, phoneKey };
    }, [aggregatedUsersById]);


    /* ---------------- filtering ---------------- */
    const filteredContacts = useMemo(() => {
        const q = String(searchQuery || '').trim().toLowerCase();
        if (!q) return unifiedContacts;
        return unifiedContacts.filter((c) => {
            const name = String(c.name || '').toLowerCase();
            const label = String(c.label || '').toLowerCase();
            const emails = (c.emails || []).join(' ').toLowerCase();
            const phones = (c.phones || []).join(' ').toLowerCase();
            const agg = (c.aggregatedUsers || []).some((u) => {
                const un = String(u.name || '').toLowerCase();
                const ue = (u.emails || []).join(' ').toLowerCase();
                const up = (u.phones || []).join(' ').toLowerCase();
                return un.includes(q) || ue.includes(q) || up.includes(q);
            });
            return name.includes(q) || label.includes(q) || emails.includes(q) || phones.includes(q) || agg;
        });
    }, [unifiedContacts, searchQuery]);

    const hasRequests = (incoming.length + outgoing.length) > 0;

    /* ---------------- UI ---------------- */
    return (
        <MainBottomSheet innerRef={innerRef}>
            {/* Header */}
            <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
                <Text style={styles.headerText}>{showRequests ? 'Incoming/Outgoing Requests' : 'Add Friend'}</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <TouchableOpacity onPress={() => innerRef.current?.dismiss()}>
                        <Text style={styles.closeText}>Cancel</Text>
                    </TouchableOpacity>
                </View>
            </View>

            {/* SEARCH / SEND INPUT row */}
            {!showRequests && (
                <View style={styles.section}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <View style={{ flex: 1 }}>
                            <TextInput
                                placeholder="Search name, email, phone — or type an email to send a request"
                                placeholderTextColor={colors.muted || '#777'}
                                value={inputValue}
                                onChangeText={handleSearchChange}
                                autoCapitalize="none"
                                keyboardType="email-address"
                                style={styles.input}
                                returnKeyType="search"
                            />
                        </View>

                        {/* Bell icon */}
                        {hasRequests && (
                            <TouchableOpacity onPress={() => setShowRequests(true)} style={{ marginLeft: 8 }}>
                                <Ionicons name="notifications" size={22} color={colors.cta || colors.primary} />
                            </TouchableOpacity>
                        )}
                    </View>

                    {/* Send Request */}
                    <TouchableOpacity
                        style={[styles.btn, { backgroundColor: colors.cta || colors.primary }]}
                        onPress={async () => {
                            const v = String(inputValue || '').trim().toLowerCase();
                            if (!v || !v.includes('@')) {
                                Alert.alert('Enter email', 'Type a valid email to send a friend request.');
                                return;
                            }
                            try {
                                setSaving(true);
                                await sendFriendRequest(v);
                                setInputValue('');
                                await pullRequests();
                                Alert.alert('Request sent', 'Friend request sent successfully.');
                            } catch (e) {
                                Alert.alert('Error', e?.message || 'Failed to send request');
                            } finally {
                                setSaving(false);
                            }
                        }}
                        disabled={saving}
                    >
                        {saving ? <ActivityIndicator color={colors.text || '#121212'} /> : <Text style={[styles.btnText, { color: colors.text || '#121212' }]}>Send Request</Text>}
                    </TouchableOpacity>

                    {/* Contacts header + Sync Now */}
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 18 }}>
                        <Text style={[styles.sectionTitle, { marginBottom: 0 }]}>Contacts</Text>
                        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                            <TouchableOpacity onPress={handleSyncNow} style={{ padding: 8 }}>
                                <Text style={{ color: colors.text || colors.primary, fontWeight: '600' }}>Sync</Text>
                            </TouchableOpacity>
                        </View>
                    </View>

                    {/* contacts list */}
                    <View style={{ marginTop: 8, flex: 1 }}>
                        {scanning && <ActivityIndicator style={{ marginVertical: 8 }} color={colors.cta || colors.primary} />}

                        <BottomSheetFlatList
                            data={filteredContacts}
                            keyExtractor={(it, idx) => it?.id ?? `row-${idx}`}
                            keyboardShouldPersistTaps="handled"
                            nestedScrollEnabled={Platform.OS === 'android'}
                            showsVerticalScrollIndicator={false}
                            contentContainerStyle={{ paddingBottom: insets.bottom, paddingHorizontal: 0 }}
                            initialNumToRender={12}
                            maxToRenderPerBatch={20}
                            windowSize={8}
                            removeClippedSubviews={true}
                            ListEmptyComponent={() => <Text style={styles.emptyText}>No contacts found</Text>}
                            /* if your rows are fixed-height, uncomment these two lines and tune ROW_HEIGHT */
                            // getItemLayout={(data, index) => ({ length: ROW_HEIGHT, offset: ROW_HEIGHT * index, index })}
                            // extraData={user?.friends}

                            renderItem={({ item }) => {
                                const { type: reqType, req: matchedReq } = rowRequestForItem(item);

                                const friendsSet = new Set((user?.friends || []).map((f) => String(f)));
                                const aggUsers = Array.isArray(item.aggregatedUsers) ? item.aggregatedUsers : [];
                                const isFriend = aggUsers.some((u) => {
                                    const uid = String(u.userId || u.id || '').trim();
                                    return uid && friendsSet.has(uid);
                                });

                                let rightElement = null;

                                if (reqType === 'incoming' && matchedReq) {
                                    rightElement = (
                                        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                                            <TouchableOpacity
                                                onPress={async () => {
                                                    try {
                                                        await acceptFriendRequest(matchedReq._id);
                                                        await pullRequests();
                                                    } catch (e) {
                                                        Alert.alert('Error', e?.message || 'Failed to accept request');
                                                    }
                                                }}
                                                style={[styles.reqBtn, { borderColor: colors.cta || colors.primary, marginRight: 8 }]}
                                            >
                                                <Text style={{ color: colors.cta || colors.primary }}>Accept</Text>
                                            </TouchableOpacity>

                                            <TouchableOpacity
                                                onPress={async () => {
                                                    try {
                                                        await rejectFriendRequest(matchedReq._id);
                                                        await pullRequests();
                                                    } catch (e) {
                                                        Alert.alert('Error', e?.message || 'Failed to decline request');
                                                    }
                                                }}
                                                style={[styles.reqBtn, { borderColor: colors.negative || '#ef4444' }]}
                                            >
                                                <Text style={{ color: colors.negative || '#ef4444' }}>Decline</Text>
                                            </TouchableOpacity>
                                        </View>
                                    );
                                } else if (reqType === 'outgoing' && matchedReq) {
                                    rightElement = (
                                        <View style={{ alignItems: 'flex-end' }}>
                                            <Text style={{ color: colors.muted || '#999', fontSize: 12 }}>Request Sent</Text>
                                        </View>
                                    );
                                } else if (isFriend) {
                                    rightElement = <Text style={{ color: colors.muted || '#999', fontSize: 12 }}>Friends</Text>;
                                } else if (item.isOnApp) {
                                    rightElement = (
                                        <TouchableOpacity
                                            onPress={() => handleSendFriendRequestToUser(item)}
                                            style={[styles.reqBtn, { borderColor: colors.cta || colors.primary }]}
                                        >
                                            <Text style={{ color: colors.cta || colors.primary }}>Add</Text>
                                        </TouchableOpacity>
                                    );
                                } else {
                                    rightElement = (
                                        <TouchableOpacity
                                            onPress={() => handleInviteRow(item)}
                                            style={[styles.reqBtn, { borderColor: colors.cta || colors.primary }]}
                                        >
                                            <Text style={{ color: colors.cta || colors.primary }}>Invite</Text>
                                        </TouchableOpacity>
                                    );
                                }

                                return (
                                    <View key={item.id} style={styles.reqRow}>
                                        <View style={{ flex: 1 }}>
                                            <Text style={styles.reqName}>{item.name || item.label || 'Contact'}</Text>
                                            <Text style={styles.reqEmail}>
                                                {[...(item.phones || []), ...(item.emails || [])].filter(Boolean).join(', ')}
                                            </Text>

                                            {Array.isArray(item.aggregatedUsers) && item.aggregatedUsers.length > 1 && (
                                                <Text style={[styles.smallNote, { marginTop: 6 }]}>{`${item.aggregatedUsers.length} linked Expensease accounts`}</Text>
                                            )}
                                        </View>

                                        <View style={{ marginLeft: 12 }}>{rightElement}</View>
                                    </View>
                                );
                            }}
                        />
                    </View>
                </View>
            )}

            {/* REQUESTS VIEW */}
            {showRequests && (
                <View style={styles.section}>
                    <TouchableOpacity onPress={() => setShowRequests(false)}>
                        <Text style={[styles.smallNote, { color: colors.cta || colors.primary, marginBottom: 12 }]}>← Back to contacts</Text>
                    </TouchableOpacity>
                    {!loading && incoming.length > 0 && <>
                        <Text style={styles.sectionTitle}>Incoming Requests</Text>
                        {loading ? (
                            <ActivityIndicator color={colors.primary || colors.cta} />
                        ) : incoming.length === 0 ? (
                            <Text style={styles.emptyText}>No incoming requests</Text>
                        ) : (
                            incoming.map((req) => (
                                <View key={req._id} style={styles.reqRow}>
                                    <View>
                                        <Text style={styles.reqName}>{req?.sender?.name || req?.email}</Text>
                                        <Text style={styles.reqEmail}>{req?.sender?.email}</Text>
                                    </View>
                                    <View style={{ flexDirection: 'row', gap: 8 }}>
                                        <TouchableOpacity onPress={() => acceptFriendRequest(req._id).then(() => pullRequests())} style={[styles.reqBtn, { borderColor: colors.cta || colors.primary }]}>
                                            <Text style={{ color: colors.cta || colors.primary }}>Accept</Text>
                                        </TouchableOpacity>
                                        <TouchableOpacity onPress={() => rejectFriendRequest(req._id).then(() => pullRequests())} style={[styles.reqBtn, { borderColor: colors.negative || '#ef4444' }]}>
                                            <Text style={{ color: colors.negative || '#ef4444' }}>Decline</Text>
                                        </TouchableOpacity>
                                    </View>
                                </View>
                            ))
                        )}
                    </>}
                    {!loading && outgoing.length > 0 && <>
                        <Text style={[styles.sectionTitle, { marginTop: 16 }]}>Outgoing Requests</Text>
                        {loading ? (
                            <ActivityIndicator color={colors.primary || colors.cta} />
                        ) : outgoing.length === 0 ? (
                            <Text style={styles.emptyText}>No outgoing requests</Text>
                        ) : (
                            outgoing.map((req) => (
                                <View key={req._id} style={styles.reqRow}>
                                    <View>
                                        <Text style={styles.reqName}>{req?.receiver?.name || req?.email}</Text>
                                        <Text style={styles.reqEmail}>{req?.receiver?.email}</Text>
                                    </View>
                                    <TouchableOpacity onPress={() => cancelFriendRequest(req._id).then(() => pullRequests())} style={[styles.reqBtn, { borderColor: colors.negative || '#ef4444' }]}>
                                        <Text style={{ color: colors.negative || '#ef4444' }}>Cancel</Text>
                                    </TouchableOpacity>
                                </View>
                            ))
                        )}
                    </>}
                </View>
            )}
        </MainBottomSheet>
    );
};

export default BottomSheetFriendManager;

/* themed styles factory */
const createStyles = (c = {}) =>
    StyleSheet.create({
        header: {
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
            paddingHorizontal: 16,
            paddingBottom: 12,
            borderBottomWidth: StyleSheet.hairlineWidth,
            borderBottomColor: c.border || '#333',
        },
        headerText: { color: c.text || '#EBF1D5', fontSize: 18, fontWeight: '700' },
        closeText: { color: c.negative || '#EA4335', fontSize: 16 },
        section: { paddingHorizontal: 16, paddingVertical: 16, flex: 1 },
        sectionTitle: { color: c.text || '#EBF1D5', fontSize: 16, fontWeight: '600', marginBottom: 8 },
        input: {
            backgroundColor: c.cardAlt || '#1f1f1f',
            color: c.text || '#EBF1D5',
            borderRadius: 12,
            borderWidth: 1,
            borderColor: c.border || '#55554f',
            paddingHorizontal: 12,
            paddingVertical: 10,
            fontSize: 15,
        },
        btn: { borderRadius: 8, paddingVertical: 10, alignItems: 'center', justifyContent: 'center', marginTop: 10 },
        btnText: { fontWeight: '600' },
        reqRow: {
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
            paddingVertical: 12,
            borderBottomWidth: StyleSheet.hairlineWidth,
            borderBottomColor: c.border || '#333',
        },
        reqName: { color: c.text || '#EBF1D5', fontSize: 15, fontWeight: '600' },
        reqEmail: { color: c.muted || '#888', fontSize: 13, marginTop: 2 },
        reqBtn: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6 },
        emptyText: { color: c.muted || '#888', fontSize: 14, marginTop: 4 },
        smallNote: { fontSize: 12, color: c.muted || '#aaa' },
    });
