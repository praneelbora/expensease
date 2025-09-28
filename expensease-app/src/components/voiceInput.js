import React, { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  StyleSheet,
  ScrollView,
  Platform,
  Modal,
  SafeAreaView,
  Pressable
} from "react-native";
import Voice from "@react-native-voice/voice";
import {
  useAudioRecorder,
  RecordingPresets,
  setAudioModeAsync,
  useAudioRecorderState,
  requestRecordingPermissionsAsync,
} from "expo-audio";
import { Feather } from "@expo/vector-icons";
import VoiceService from "services/VoiceService";
import { useTheme } from "context/ThemeProvider";

const MIN_RECORD_MS = 3 * 1000;
const MAX_RECORD_MS = 18 * 1000;
const hardcodedList = [
  { label: "English (US)", value: "en-US" },
  { label: "English (UK)", value: "en-GB" },
  { label: "Hindi (India)", value: "hi-IN" },
  { label: "Marathi (India)", value: "mr-IN" },
  { label: "Gujarati (India)", value: "gu-IN" },
  { label: "Bengali (India)", value: "bn-IN" },
  { label: "Kannada (India)", value: "kn-IN" },
  { label: "Telugu (India)", value: "te-IN" },
];

export default function VoiceInput({
  initialValue = "",
  locale: initialLocale = "en-US",
  onParsed = () => { },
  token = null,
  promptLabel = "Say amount, who, and what for",
}) {
  const { theme } = useTheme?.() || {};
  const colors = (theme && theme.colors) || {
    background: "#0b0b0b",
    text: "#fff",
    card: "#121212",
    cta: "#00C49F",
    primary: "#14b8a6",
    border: "#2a2a2a",
    muted: "#9aa0a6",
    negative: "#ff6b6b",
  };

  const [isListening, setIsListening] = useState(false);
  const [partialTranscript, setPartialTranscript] = useState("");
  const [finalTranscript, setFinalTranscript] = useState(initialValue || "");
  const [loadingSend, setLoadingSend] = useState(false);
  const [error, setError] = useState(null);
  const [supportedLocales, setSupportedLocales] = useState(hardcodedList);

  const [locale, setLocale] = useState(initialLocale);
  const [localeOpen, setLocaleOpen] = useState(false);

  const [remainingMs, setRemainingMs] = useState(MAX_RECORD_MS);
  const countdownIntervalRef = useRef(null);

  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recorderState = useAudioRecorderState(recorder);

  const recordTimeoutRef = useRef(null);
  const minDurationRef = useRef(null);
  const recordStartTsRef = useRef(null);

  const [open, setOpen] = useState(false); // main modal open flag

  // --- Voice event bindings (same logic)
  useEffect(() => {
    Voice.onSpeechStart = () => setError(null);
    Voice.onSpeechPartialResults = (e) => {
      if (e && e.value && e.value.length > 0) {
        setPartialTranscript(e.value.join(" "));
      }
    };
    Voice.onSpeechResults = (e) => {
      if (e && e.value && e.value.length > 0) {
        const text = e.value.join(" ").trim();
        setFinalTranscript(text);
        setPartialTranscript("");
      }
    };
    Voice.onSpeechEnd = () => setIsListening(false);
    Voice.onSpeechError = (e) => {
      console.warn("Voice error:", e);
      setError(e?.error?.message || JSON.stringify(e));
      setIsListening(false);
    };

    return () => {
      Voice.destroy().then(Voice.removeAllListeners).catch(() => { });
      stopAndReleaseIfRecording();
      clearAllTimers();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function clearAllTimers() {
    if (recordTimeoutRef.current) {
      clearTimeout(recordTimeoutRef.current);
      recordTimeoutRef.current = null;
    }
    if (minDurationRef.current) {
      clearTimeout(minDurationRef.current);
      minDurationRef.current = null;
    }
    if (countdownIntervalRef.current) {
      clearInterval(countdownIntervalRef.current);
      countdownIntervalRef.current = null;
    }
    recordStartTsRef.current = null;
    setRemainingMs(MAX_RECORD_MS);
  }

  async function ensureRecordingPermissions() {
    try {
      const { granted } = await requestRecordingPermissionsAsync();
      if (!granted) {
        Alert.alert("Permission required", "Microphone permission is required to record audio.");
        return false;
      }
      return true;
    } catch (err) {
      console.warn("permission check error", err);
      return false;
    }
  }

  async function prepareAndStartRecorder() {
    await setAudioModeAsync({
      allowsRecording: true,
      playsInSilentMode: true,
    });
    if (recorder && typeof recorder.prepareToRecordAsync === "function") {
      await recorder.prepareToRecordAsync();
    }
    recordStartTsRef.current = Date.now();
    setRemainingMs(MAX_RECORD_MS);

    if (countdownIntervalRef.current) {
      clearInterval(countdownIntervalRef.current);
    }
    countdownIntervalRef.current = setInterval(() => {
      const elapsed = Date.now() - (recordStartTsRef.current || Date.now());
      const rem = Math.max(MAX_RECORD_MS - elapsed, 0);
      setRemainingMs(rem);
    }, 200);

    recordTimeoutRef.current = setTimeout(async () => {
      try {
        await stopListening();
      } catch { }
    }, MAX_RECORD_MS);

    minDurationRef.current = setTimeout(() => {
      minDurationRef.current = null;
    }, MIN_RECORD_MS);

    recorder.record();
  }

  async function stopAndReleaseIfRecording() {
    try {
      if (!recorder) return null;
      const status = recorderState;
      if (status?.isRecording) {
        await recorder.stop();
      }
      const uri = recorder?.uri ?? null;
      if (recordTimeoutRef.current) {
        clearTimeout(recordTimeoutRef.current);
        recordTimeoutRef.current = null;
      }
      if (countdownIntervalRef.current) {
        clearInterval(countdownIntervalRef.current);
        countdownIntervalRef.current = null;
      }
      return uri;
    } catch (err) {
      console.warn("stopAndReleaseIfRecording error", err);
      return null;
    } finally {
      setRemainingMs(MAX_RECORD_MS);
      recordStartTsRef.current = null;
      if (minDurationRef.current) {
        clearTimeout(minDurationRef.current);
        minDurationRef.current = null;
      }
      if (recordTimeoutRef.current) {
        clearTimeout(recordTimeoutRef.current);
        recordTimeoutRef.current = null;
      }
    }
  }

  async function startListening() {
    try {
      setError(null);
      setPartialTranscript("");
      setFinalTranscript("");

      const ok = await ensureRecordingPermissions();
      if (!ok) return;

      // show listening UI immediately so user doesn't feel a lag
      setIsListening(true);

      // prepare audio mode / recorder concurrently but don't block starting voice recognition
      const preparePromise = (async () => {
        try {
          await setAudioModeAsync({
            allowsRecording: true,
            playsInSilentMode: true,
          });
          if (recorder && typeof recorder.prepareToRecordAsync === "function") {
            await recorder.prepareToRecordAsync();
          }
        } catch (prepErr) {
          console.warn("recorder prepare error", prepErr);
        }
      })();

      // start speech recognition ASAP (so user sees immediate activity)
      try {
        await Voice.start(locale);
      } catch (vErr) {
        console.warn("Voice.start error (non-fatal):", vErr);
      }

      // once recorder is prepared (or after attempted prepare), start timer + recorder
      try {
        await preparePromise;
      } catch (e) {
        // already logged; continue to attempt to start recorder anyway
      }

      // record start timestamp + countdown
      recordStartTsRef.current = Date.now();
      setRemainingMs(MAX_RECORD_MS);

      if (countdownIntervalRef.current) {
        clearInterval(countdownIntervalRef.current);
      }
      countdownIntervalRef.current = setInterval(() => {
        const elapsed = Date.now() - (recordStartTsRef.current || Date.now());
        const rem = Math.max(MAX_RECORD_MS - elapsed, 0);
        setRemainingMs(rem);
      }, 200);

      if (recordTimeoutRef.current) {
        clearTimeout(recordTimeoutRef.current);
      }
      recordTimeoutRef.current = setTimeout(async () => {
        try {
          await stopListening();
        } catch { }
      }, MAX_RECORD_MS);

      if (minDurationRef.current) {
        clearTimeout(minDurationRef.current);
      }
      minDurationRef.current = setTimeout(() => {
        minDurationRef.current = null;
      }, MIN_RECORD_MS);

      try {
        // start actual recorder (best-effort)
        if (recorder && typeof recorder.record === "function") {
          recorder.record();
        }
      } catch (recErr) {
        console.warn("recorder.record() error (non-fatal):", recErr);
      }
    } catch (e) {
      console.error("startListening error", e);
      setError(String(e));
      setIsListening(false);
    }
  }


  async function stopListening() {
    try {
      if (minDurationRef.current) return;
      try {
        await Voice.stop();
      } catch { }
      await stopAndReleaseIfRecording();
      setIsListening(false);
      clearAllTimers();
    } catch (e) {
      console.error("stopListening error", e);
      setError(String(e));
    }
  }

  async function cancelTranscript() {
    try {
      await stopListening();
    } catch { }
    setPartialTranscript("");
    setFinalTranscript("");
    setError(null);
  }

  async function sendTranscript() {
    const textToSend = (finalTranscript || partialTranscript || "").trim();
    if (!textToSend) {
      Alert.alert("Nothing to send", "Please speak before sending.");
      return;
    }

    setLoadingSend(true);
    setError(null);

    try {
      try {
        await stopListening();
      } catch (err) {
        console.warn("failed to fully stop before send:", err);
      }
      await stopAndReleaseIfRecording();

      const resp = await VoiceService.sendTranscriptOnly({
        transcript: textToSend,
        locale,
        token,
      });

      if (resp && resp.parsed) {
        onParsed(resp.parsed);
      }

      setPartialTranscript("");
      setFinalTranscript("");
      setOpen(false);
    } catch (err) {
      console.error("sendTranscript error", err);
      setError(String(err?.message || err));
      Alert.alert("Send failed", String(err?.message || err));
    } finally {
      setLoadingSend(false);
      setIsListening(false);
      clearAllTimers();
    }
  }

  // compact display & control calculations
  const displayText = partialTranscript && !finalTranscript ? partialTranscript : finalTranscript;
  const hasNonEmptyText = !!(displayText && String(displayText).trim());
  const showCancel = isListening || hasNonEmptyText;
  const remainingSeconds = Math.ceil(remainingMs / 1000);
  const selectedLabel = supportedLocales?.find((l) => l.value === locale)?.label || locale;

  // small styles
  const s = compactStyles(colors, { isListening, showCancel });

  return (
    <SafeAreaView pointerEvents="box-none">
      {/* Floating mic button (initial view) */}
      <View style={s.floatingContainer} pointerEvents="box-none">
        <TouchableOpacity
          onPress={() => setOpen(true)}
          activeOpacity={0.85}
          style={s.floatingMic}
          accessibilityLabel="Open voice input"
        >
          <Feather name="mic" size={20} color={colors.text} />
        </TouchableOpacity>
      </View>

      {/* Full modal with compact UI shown when user taps the mic */}
      <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
        {/* Pressable backdrop: tapping outside the card closes the modal */}
        <Pressable style={s.modalBackdrop} onPress={() => { cancelTranscript(); setOpen(false); }}>
          {/* inner Pressable stops propagation so taps on the card do NOT close */}
          <Pressable onPress={() => { }} style={s.modalCard}>
            {/* Header: X (close) and BETA label */}
            <View style={s.modalHeader}>
              <TouchableOpacity onPress={() => { cancelTranscript(); setOpen(false); }} style={s.headerBtn}>
                <Feather name="x" size={20} color={colors.muted} />
              </TouchableOpacity>

              <Text style={s.modalTitleText}>Voice input</Text>

              {/* BETA label instead of send button */}
              <View style={s.headerBtn}>
                <Text style={{ color: colors.primary, fontSize: 13, fontWeight: "700" }}>(Beta)</Text>
              </View>
            </View>

            {/* Catchy Explanation / micro-help */}
            <Text style={s.explainText}>
              Quick & hands-free — say something like: "200 to Ayaan for dinner". I'll automatically pick out the amount, who it's for, and what it's for so you can log expenses in a tap.
            </Text>

            {/* Transcript card with breathing room */}
            <View style={s.transcriptCardInner}>
              <View style={s.topRowInner}>
                <Text style={s.promptTextInner}>{promptLabel}</Text>
                <TouchableOpacity onPress={() => setLocaleOpen(true)} style={s.localeChipInner}>
                  <Text numberOfLines={1} style={s.localeTextInner}>{selectedLabel}</Text>
                  <Feather name="chevron-down" size={14} color={colors.muted} />
                </TouchableOpacity>
              </View>

              <TextInput
                multiline
                placeholder="Tap mic and speak..."
                placeholderTextColor={colors.muted}
                value={displayText}
                onChangeText={(txt) => {
                  setFinalTranscript(txt);
                  setPartialTranscript("");
                }}
                style={s.transcriptInputInner}
                editable={!loadingSend}
              />

              <View style={s.statusRowInner}>
                <Text style={s.statusTextInner}>{isListening ? `Recording • ${remainingSeconds}s` : hasNonEmptyText ? "Ready to send" : "Idle"}</Text>
                {loadingSend ? <ActivityIndicator size="small" color={colors.muted} /> : null}
              </View>

              {error ? <Text style={[s.errorTextInner, { color: colors.negative }]}>{error}</Text> : null}
            </View>

            {/* Controls placed outside the bordered transcript card so they "float" visually */}
            <View style={s.controlsOuterRow}>
              {showCancel ? (
                <TouchableOpacity onPress={cancelTranscript} style={s.iconBtnOuter} accessibilityLabel="Discard transcript">
                  <Feather name="x" size={18} color={colors.text} />
                </TouchableOpacity>
              ) : (
                <View style={s.iconBtnPlaceholderOuter} />
              )}

              <TouchableOpacity
                onPress={() => (isListening ? stopListening() : startListening())}
                activeOpacity={0.85}
                style={[s.micBtnOuter, isListening ? s.micBtnActiveOuter : null]}
                accessibilityLabel={isListening ? "Stop recording" : "Start recording"}
              >
                <Feather name={isListening ? "mic-off" : "mic"} size={24} color={colors.text} />
              </TouchableOpacity>

              {showCancel ? (
                <TouchableOpacity onPress={sendTranscript} style={s.iconBtnOuter} disabled={loadingSend} accessibilityLabel="Send transcript">
                  {loadingSend ? <ActivityIndicator size="small" color={colors.text} /> : <Feather name="check" size={18} color={colors.text} />}
                </TouchableOpacity>
              ) : (
                <View style={s.iconBtnPlaceholderOuter} />
              )}
            </View>

            {/* Locale picker modal inside main modal */}
            <Modal visible={localeOpen} transparent animationType="fade" onRequestClose={() => setLocaleOpen(false)}>
              <View style={s.modalBackdropInner}>
                <View style={[s.localeModalCard, { backgroundColor: colors.card }]}>
                  <Text style={[s.modalTitleSmall, { color: colors.text }]}>Language</Text>
                  <ScrollView style={{ maxHeight: 240 }}>
                    {supportedLocales.map((l) => {
                      const isSel = l.value === locale;
                      return (
                        <TouchableOpacity
                          key={l.value}
                          onPress={() => {
                            setLocale(l.value);
                            setLocaleOpen(false);
                          }}
                          style={[s.localeRowInner, isSel && s.localeRowSelInner]}
                        >
                          <Text style={s.localeRowTextInner}>{l.label}</Text>
                          {isSel ? <Feather name="check" size={16} color={colors.cta} /> : null}
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>
                  <View style={{ flexDirection: "row", justifyContent: "flex-end", marginTop: 8 }}>
                    <TouchableOpacity onPress={() => setLocaleOpen(false)}>
                      <Text style={{ color: colors.muted }}>Close</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            </Modal>

          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

const compactStyles = (colors, opts = {}) =>
  StyleSheet.create({
    /* Floating mic */
    floatingContainer: {
      alignItems: "flex-end",
      justifyContent: "flex-end",
    },
    floatingMic: {
      width: 58,
      height: 58,
      borderRadius: 32,
      backgroundColor: colors.cta || colors.primary || "#00C49F",
      justifyContent: "center",
      alignItems: "center",
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.15,
      shadowRadius: 6,
      elevation: 5,
    },

    modalBackdrop: {
      flex: 1,
      backgroundColor: "rgba(0,0,0,0.45)",
      justifyContent: "flex-end",
    },
    modalCard: {
      backgroundColor: colors.background,
      borderTopLeftRadius: 16,
      borderTopRightRadius: 16,
      paddingHorizontal: 16,
      paddingBottom: 16,
      paddingTop: 12,
      minHeight: 360,
    },
    modalHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingBottom: 10,
    },
    headerBtn: {
      height: 40,
      justifyContent: "center",
      alignItems: "center",
    },
    modalTitleText: { color: colors.text, fontSize: 17, fontWeight: "700" },

    explainText: { color: colors.muted, fontSize: 14, marginBottom: 12, lineHeight: 20 },

    transcriptCardInner: {
      width: "100%",
      backgroundColor: "transparent",
      borderRadius: 12,
      paddingVertical: 14,
      paddingHorizontal: 14,
      minHeight: 140,
      borderWidth: 1,
      borderColor: colors.border || "#333",
      marginBottom: 16,
    },
    topRowInner: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: 8,
    },
    promptTextInner: { color: colors.muted, fontSize: 13 },
    localeChipInner: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: 10,
      height: 34,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.card,
    },
    localeTextInner: { color: colors.text, fontSize: 13, maxWidth: 130, marginRight: 8 },
    transcriptInputInner: {
      minHeight: 56,
      maxHeight: 160,
      textAlignVertical: "top",
      fontSize: 16,
      color: colors.text,
      padding: 0,
    },
    statusRowInner: { marginTop: 10, flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
    statusTextInner: { color: colors.muted, fontSize: 13 },

    /* Controls outside transcript box */
    controlsOuterRow: { flexDirection: "row", justifyContent: "center", alignItems: "center", marginTop: 4 },
    micBtnOuter: {
      width: 72,
      height: 72,
      borderRadius: 36,
      backgroundColor: colors.cta || colors.primary || "#00C49F",
      justifyContent: "center",
      alignItems: "center",
      marginHorizontal: 18,
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 3 },
      shadowOpacity: 0.16,
      shadowRadius: 6,
      elevation: 3,
    },
    micBtnActiveOuter: { backgroundColor: colors.negative || "#FF6B6B" },
    iconBtnOuter: {
      width: 48,
      height: 48,
      borderRadius: 24,
      backgroundColor: colors.card || "#161616",
      justifyContent: "center",
      alignItems: "center",
      marginHorizontal: 8,
      borderWidth: 1,
      borderColor: colors.border || "#333",
    },
    iconBtnPlaceholderOuter: { width: 48, height: 48, marginHorizontal: 8, opacity: 0 },

    errorTextInner: { marginTop: 8, textAlign: "center", fontSize: 13 },

    /* inner locale modal */
    modalBackdropInner: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "center", padding: 20 },
    localeModalCard: { borderRadius: 12, padding: 14 },
    modalTitleSmall: { fontSize: 16, marginBottom: 8 },
    localeRowInner: {
      paddingVertical: 12,
      paddingHorizontal: 10,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      borderBottomWidth: 1,
      borderBottomColor: "rgba(255,255,255,0.03)",
    },
    localeRowSelInner: { backgroundColor: Platform.OS === "ios" ? "#ffffff06" : colors.card },
    localeRowTextInner: { color: colors.text, fontSize: 15 },
  });
