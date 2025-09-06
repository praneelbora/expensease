// app/account/NotificationsSettings.js
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  Switch,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { Feather } from "@expo/vector-icons";
import Header from "~/header";
import { useTheme } from "context/ThemeProvider";
import { useRouter } from "expo-router";

import { fetchUserData, updateUserProfile } from "services/UserService";

// Simple canonical category keys (match server model)
const CATEGORIES = {
  PERSONAL_SUMMARY: "personal_expense_summaries",
  SPLIT_EXPENSE: "split_expense",
  GROUP_EXPENSE: "group_expense",
  FRIEND_SETTLEMENT: "friend_settlement",
  GROUP_SETTLEMENT: "group_settlement",
  FRIEND_REQUEST: "friend_request",
  GROUPS: "groups",
};

const DEFAULT_CATEGORY_ORDER = [
  { key: CATEGORIES.PERSONAL_SUMMARY, label: "Personal summaries" },
  { key: CATEGORIES.SPLIT_EXPENSE, label: "Split expenses (friend)" },
  { key: CATEGORIES.GROUP_EXPENSE, label: "Group expenses" },
  { key: CATEGORIES.FRIEND_SETTLEMENT, label: "Friend settlements" },
  { key: CATEGORIES.GROUP_SETTLEMENT, label: "Group settlements" },
  { key: CATEGORIES.FRIEND_REQUEST, label: "Friend requests" },
  { key: CATEGORIES.GROUPS, label: "Groups" },
];

export default function NotificationsSettings() {
  const { theme } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [user, setUser] = useState(null);
  const [prefs, setPrefs] = useState({
    push: { enabled: true, categories: {}, mutedUntil: null },
    email: { enabled: false, categories: {} },
    inapp: { enabled: true, categories: {} },
  });
  const [dirty, setDirty] = useState(false);

  // refs for debounce and initial load
  const saveTimeoutRef = useRef(null);
  const initialLoadedRef = useRef(false);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    (async () => {
      setLoading(true);
      try {
        const data = await fetchUserData();
        if (!isMountedRef.current) return;
        setUser(data);

        // Normalise prefs from server user doc into local state shape
        const np = data?.notificationPreferences || {};
        const ch = { push: {}, email: {}, inapp: {} };

        // helper to read categories map -> plain object
        const categoriesMapToObj = (map) => {
          if (!map) return {};
          // map may be Mongoose Map (has .get/.entries) or plain object
          if (typeof map.entries === "function") {
            const obj = {};
            for (const [k, v] of map.entries()) obj[k] = !!v;
            return obj;
          }
          if (typeof map.get === "function") {
            // older Mongoose Map
            const obj = {};
            for (const [k, v] of map.entries()) obj[k] = !!v;
            return obj;
          }
          // plain object:
          const obj = {};
          Object.entries(map).forEach(([k, v]) => {
            obj[k] = !!v;
          });
          return obj;
        };

        ch.push.enabled = !!(np.push?.enabled ?? true);
        ch.push.categories = categoriesMapToObj(np.push?.categories ?? undefined);
        ch.push.mutedUntil = np.push?.mutedUntil ? new Date(np.push.mutedUntil) : null;

        ch.email.enabled = !!(np.email?.enabled ?? false);
        ch.email.categories = categoriesMapToObj(np.email?.categories ?? undefined);

        ch.inapp.enabled = !!(np.inapp?.enabled ?? true);
        ch.inapp.categories = categoriesMapToObj(np.inapp?.categories ?? undefined);

        // Ensure every known category key exists with boolean (defaults)
        for (const c of Object.values(CATEGORIES)) {
          if (ch.push.categories[c] == null) ch.push.categories[c] = true;
          if (ch.email.categories[c] == null) ch.email.categories[c] = false;
          if (ch.inapp.categories[c] == null) ch.inapp.categories[c] = true;
        }

        setPrefs(ch);
        initialLoadedRef.current = true;
      } catch (err) {
        console.error("Failed to load user data:", err);
      } finally {
        if (isMountedRef.current) setLoading(false);
      }
    })();

    return () => {
      isMountedRef.current = false;
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, []);

  // Build payload shape for server
  const buildPayloadFromPrefs = (p) => {
    return {
      notificationPreferences: {
        push: {
          enabled: !!p.push.enabled,
          categories: { ...(p.push.categories || {}) },
          mutedUntil: p.push.mutedUntil
            ? p.push.mutedUntil instanceof Date
              ? p.push.mutedUntil.toISOString()
              : p.push.mutedUntil
            : null,
        },
        email: {
          enabled: !!p.email.enabled,
          categories: { ...(p.email.categories || {}) },
        },
        inapp: {
          enabled: !!p.inapp.enabled,
          categories: { ...(p.inapp.categories || {}) },
        },
      },
    };
  };

  // autosave function (no alerts). Returns promise.
  const doSave = async (currentPrefs) => {
    setSaving(true);
    try {
      const payload = buildPayloadFromPrefs(currentPrefs);
      await updateUserProfile(payload);
      setDirty(false);
      // refresh user quietly
      try {
        const refreshed = await fetchUserData();
        if (isMountedRef.current) setUser(refreshed);
      } catch (e) {
        // ignore refresh errors
        console.error("refresh after save failed:", e);
      }
    } catch (err) {
      // Do not alert the user. Log for diagnostics.
      console.error("Failed to autosave notification prefs:", err);
      // Keep dirty = true so UI indicates unsaved state
      setDirty(true);
    } finally {
      if (isMountedRef.current) setSaving(false);
    }
  };

  // Debounced autosave: watch prefs changes and save (but ignore initial load)
  useEffect(() => {
    // do not autosave before initial load is complete
    if (!initialLoadedRef.current) return;

    // mark dirty and schedule save
    setDirty(true);
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);

    // debounce (800ms)
    saveTimeoutRef.current = setTimeout(() => {
      // call save
      doSave(prefs).catch((e) => console.error("autosave error:", e));
      saveTimeoutRef.current = null;
    }, 800);

    return () => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefs]); // deps intentionally only prefs

  // Helper: set all categories to a value across channels
  const setAllCategoriesForAllChannels = (value) => {
    setPrefs((prev) => {
      const next = { ...prev };
      for (const ch of ["push", "email", "inapp"]) {
        next[ch] = { ...(next[ch] || {}) };
        const cats = { ...(next[ch].categories || {}) };
        for (const c of Object.values(CATEGORIES)) cats[c] = !!value;
        next[ch].categories = cats;
      }
      return next;
    });
  };

  // Format muted label for header
  const formatMutedText = () => {
    const mutedUntil = prefs?.push?.mutedUntil;
    const pushEnabled = !!prefs?.push?.enabled;
    if (!pushEnabled && !mutedUntil) {
      return "Muted";
    }
    if (mutedUntil) {
      const d = mutedUntil instanceof Date ? mutedUntil : new Date(mutedUntil);
      if (isNaN(d.getTime())) return null;
      // short formatting: if same day show time, else show date + time (locale)
      try {
        const now = new Date();
        const sameDay =
          d.getFullYear() === now.getFullYear() &&
          d.getMonth() === now.getMonth() &&
          d.getDate() === now.getDate();
        if (sameDay) {
          return `Muted until ${d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
        } else {
          return `Muted until ${d.toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}`;
        }
      } catch {
        return `Muted until ${d.toISOString()}`;
      }
    }
    return null;
  };

  // MAIN: when changing a channel master switch
  const setChannelEnabled = (channel, enabled) => {
    // Special behaviour requested:
    // - If push master is turned OFF -> set email & inapp masters OFF and set *all categories* OFF.
    // - If push master is turned ON  -> set email & inapp masters ON and set *all categories* ON.
    if (channel === "push") {
      if (!enabled) {
        // push turned OFF: switch everything off + clear push mute
        setPrefs((prev) => {
          const next = {
            push: { ...(prev.push || {}), enabled: false, mutedUntil: null },
            email: { ...(prev.email || {}), enabled: false },
            inapp: { ...(prev.inapp || {}), enabled: false },
          };
          // set all categories false
          for (const ch of ["push", "email", "inapp"]) {
            next[ch].categories = {};
            for (const c of Object.values(CATEGORIES)) next[ch].categories[c] = false;
          }
          return next;
        });
        return;
      } else {
        // push turned ON: switch everything on and enable all categories
        setPrefs((prev) => {
          const next = {
            push: { ...(prev.push || {}), enabled: true },
            email: { ...(prev.email || {}), enabled: true },
            inapp: { ...(prev.inapp || {}), enabled: true },
          };
          // set all categories true
          for (const ch of ["push", "email", "inapp"]) {
            next[ch].categories = {};
            for (const c of Object.values(CATEGORIES)) next[ch].categories[c] = true;
          }
          return next;
        });
        return;
      }
    }

    // Non-push channels: normal toggle (but if push is currently OFF and user tries to enable email/inapp,
    // we will also enable push so rules stay consistent — optional, but desirable to avoid dead state)
    setPrefs((prev) => {
      const next = { ...prev, [channel]: { ...(prev[channel] || {}), enabled } };

      // If enabling email/inapp while push is OFF, bring push ON and set categories to true for all.
      if (enabled && (channel === "email" || channel === "inapp") && !prev.push?.enabled) {
        // turn push on and set categories true across channels
        next.push = { ...(next.push || {}), enabled: true, mutedUntil: null };
        for (const ch of ["push", "email", "inapp"]) {
          next[ch].categories = {};
          for (const c of Object.values(CATEGORIES)) next[ch].categories[c] = true;
        }
      }

      return next;
    });
  };

  const toggleCategory = (channel, categoryKey) => {
    // If push master is off and user toggles push category, the push state remains false;
    // but the requirement is already covered by setChannelEnabled — we leave toggle free,
    // autosave will persist whatever they set. However, for clarity we'll still allow toggles.
    setPrefs((prev) => {
      const chPrefs = { ...(prev[channel] || {}) };
      chPrefs.categories = { ...(chPrefs.categories || {}), [categoryKey]: !chPrefs.categories[categoryKey] };
      const next = { ...prev, [channel]: chPrefs };
      return next;
    });
  };

  const setPushMutedUntil = (msFromNow) => {
    setPrefs((prev) => {
      const next = { ...prev, push: { ...prev.push, mutedUntil: msFromNow ? new Date(Date.now() + msFromNow) : null } };
      return next;
    });
  };

  const quickMute = (label) => {
    switch (label) {
      case "8h":
        return setPushMutedUntil(1000 * 60 * 60 * 8);
      case "1d":
        return setPushMutedUntil(1000 * 60 * 60 * 24);
      case "1w":
        return setPushMutedUntil(1000 * 60 * 60 * 24 * 7);
      case "off":
        // clear mutedUntil (unmute)
        return setPushMutedUntil(null);
      default:
        return;
    }
  };

  const handleManualSave = async () => {
    // manual save (rare), still no alerts
    if (!initialLoadedRef.current) return;
    setSaving(true);
    try {
      await doSave(prefs);
    } catch (e) {
      console.error("manual save failed:", e);
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    Alert.alert(
      "Reset settings",
      "Reset notification settings to defaults?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Reset",
          style: "destructive",
          onPress: () => {
            const def = {
              push: { enabled: true, categories: {}, mutedUntil: null },
              email: { enabled: false, categories: {} },
              inapp: { enabled: true, categories: {} },
            };
            for (const c of Object.values(CATEGORIES)) {
              def.push.categories[c] = true;
              def.email.categories[c] = false;
              def.inapp.categories[c] = true;
            }
            setPrefs(def);
            setDirty(true);
            // autosave will run automatically due to prefs change
          },
        },
      ]
    );
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.safe}>
        <StatusBar style={theme.statusBarStyle === "dark-content" ? "dark" : "light"} />
        <Header showBack title="Notifications" />
        <View style={[styles.container, { justifyContent: "center", alignItems: "center" }]}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  const mutedText = formatMutedText();

  // determine if currently muted (future date)
  const isMuted =
    prefs?.push?.mutedUntil && new Date(prefs.push.mutedUntil).getTime() > Date.now();

  // options: if muted -> only show Unmute; else show the mute durations
  const quickOptions = isMuted
    ? [{ key: "off", label: "Unmute" }]
    : [
        { key: "8h", label: "8 hours" },
        { key: "1d", label: "1 day" },
        { key: "1w", label: "1 week" },
      ];

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <StatusBar style={theme.statusBarStyle === "dark-content" ? "dark" : "light"} />
      <Header showBack title="Notifications" />
      <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
        <Text style={styles.lead}>Control which notifications you receive.</Text>

        {/* CHANNEL: PUSH */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Text style={styles.sectionTitle}>Push notifications</Text>
            </View>
            <Switch value={!!prefs.push.enabled} onValueChange={(v) => setChannelEnabled("push", v)} />
          </View>
          <View style={{flexDirection: 'row'}}>
            {mutedText ? (
                <View style={styles.mutedBadge}>
                  <Text style={styles.mutedTextSmall}>{mutedText}</Text>
                </View>
              ) : null}
          </View>
          {!isMuted && <Text style={styles.sectionNote}>{isMuted ? "Push is muted — tap Unmute to enable." : "Quick mute notifications"}</Text>}

          <View style={styles.quickMuteRow}>
            {quickOptions.map((it) => {
              const active =
                prefs.push.mutedUntil &&
                it.key !== "off" &&
                (() => {
                  const ms = (() => {
                    switch (it.key) {
                      case "8h":
                        return 1000 * 60 * 60 * 8;
                      case "1d":
                        return 1000 * 60 * 60 * 24;
                      case "1w":
                        return 1000 * 60 * 60 * 24 * 7;
                      default:
                        return 0;
                    }
                  })();
                  const remaining = new Date(prefs.push.mutedUntil) - Date.now();
                  return Math.abs(remaining - ms) < 1000 * 60;
                })();

              // if muted and this is Unmute button, style it as primary so it's obvious
              const isUnmute = it.key === "off";

              return (
                <TouchableOpacity
                  key={it.key}
                  onPress={() => quickMute(it.key)}
                  style={[
                    styles.quickMuteBtn,
                    active && styles.quickMuteBtnActive,
                    isUnmute && styles.unmuteBtn,
                  ]}
                >
                  <Text style={[styles.quickMuteText, active && styles.quickMuteTextActive, isUnmute && styles.unmuteText]}>
                    {it.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <Text style={styles.sectionNote}>Categories</Text>
          <View style={styles.catList}>
            {DEFAULT_CATEGORY_ORDER.map((c) => (
              <View style={styles.catRow} key={c.key}>
                <Text style={styles.catLabel}>{c.label}</Text>
                <Switch value={!!(prefs.push.categories && prefs.push.categories[c.key])} onValueChange={() => toggleCategory("push", c.key)} />
              </View>
            ))}
          </View>
        </View>

        <TouchableOpacity onPress={handleReset} style={styles.resetBtn}>
          <Text style={styles.resetBtnText}>Reset</Text>
        </TouchableOpacity>

        <View style={{ height: 80 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

/* Styles */
const createStyles = (theme) =>
  StyleSheet.create({
    safe: { flex: 1, backgroundColor: theme.colors.background },
    container: { padding: 16, paddingBottom: 20 },
    lead: { color: theme.colors.text, marginBottom: 0, fontSize: 15 },

    section: {
      marginTop: 12,
      padding: 12,
      borderRadius: 12,
      backgroundColor: theme.colors.card,
      borderWidth: 1,
      borderColor: theme.colors.border,
    },
    sectionHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
    sectionTitle: { fontSize: 16, fontWeight: "700", color: theme.colors.text },
    sectionNote: { color: theme.colors.muted, marginTop: 12, fontSize: 12 },

    mutedBadge: {
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 999,
      backgroundColor: "rgba(175,175,175,0.12)",
      borderWidth: 1,
      borderColor: "rgba(175,175,175,0.18)",
    },
    mutedTextSmall: {
      fontSize: 12,
      color: theme.colors.muted,
      fontWeight: "600",
    },

    quickMuteRow: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
    quickMuteBtn: {
      paddingVertical: 6,
      paddingHorizontal: 10,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.surface,
      marginTop: 8,
    },
    quickMuteBtnActive: {
      backgroundColor: theme.colors.primary,
      borderColor: theme.colors.primary,
    },
    quickMuteText: { color: theme.colors.text },
    quickMuteTextActive: { color: "#fff" },

    // special unmute button style when showing only Unmute
    unmuteBtn: {
      // backgroundColor: theme.colors.primary,
      // borderColor: theme.colors.primary,
    },
    unmuteText: { color: theme.colors.negative, fontWeight: "700" },

    catList: { marginTop: 12 },
    catRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: theme.colors.border },
    catLabel: { color: theme.colors.text },

    linkBtn: {
      flexDirection: "row",
      alignItems: "center",
      paddingVertical: 10,
      paddingHorizontal: 12,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.surface,
      marginRight: 8,
    },
    linkBtnText: { color: theme.colors.primary },

    saveRow: { marginTop: 18, flexDirection: "row", gap: 12, alignItems: "center" },
    saveBtn: { flex: 1, paddingVertical: 12, borderRadius: 10, backgroundColor: theme.colors.primary, alignItems: "center", justifyContent: "center" },
    saveBtnText: { color: "#fff", fontWeight: "700" },
    resetBtn: { paddingVertical: 12, paddingHorizontal: 14, borderRadius: 10, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.card, marginTop: 12 },
    resetBtnText: { color: theme.colors.negative },
  });
