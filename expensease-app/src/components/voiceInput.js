// src/components/VoiceInput.js
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
const MAX_RECORD_MS = 15 * 1000;
const hardcodedList = [
  { label: "English (US)", value: "en-US" },
  { label: "English (UK)", value: "en-GB" },
  { label: "Hindi (India)", value: "hi-IN" },
  { label: "Marathi (India)", value: "mr-IN" },
  { label: "Gujarati (India)", value: "gu-IN" },
  { label: "Bengali (India)", value: "bn-IN" },
  { label: "Kannada (India)", value: "kn-IN" },
  { label: "Telugu (India)", value: "te-IN" },
  // add more locales your backend/voice engine supports
];

export default function VoiceInput({
  initialValue = "",
  locale: initialLocale = "en-US",
  onParsed = () => { },
  token = null,
}) {
  const { theme } = useTheme?.() || {};
  const colors = (theme && theme.colors) || {
    background: "#000",
    text: "#fff",
    card: "#191919",
    cta: "#00C49F",
    primary: "#14b8a6",
    border: "#333",
    muted: "#888",
    negative: "#ef4444",
  };

  const [isListening, setIsListening] = useState(false);
  const [partialTranscript, setPartialTranscript] = useState("");
  const [finalTranscript, setFinalTranscript] = useState(initialValue || "");
  const [loadingSend, setLoadingSend] = useState(false);
  const [error, setError] = useState(null);
  const [supportedLocales, setSupportedLocales] = useState(hardcodedList);

  // locale picker
  const [locale, setLocale] = useState(initialLocale);
  const [localeOpen, setLocaleOpen] = useState(false);

  // timer state for UI countdown
  const [remainingMs, setRemainingMs] = useState(MAX_RECORD_MS);
  const countdownIntervalRef = useRef(null);

  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recorderState = useAudioRecorderState(recorder);

  const recordTimeoutRef = useRef(null);
  const minDurationRef = useRef(null);
  const recordStartTsRef = useRef(null);
  useEffect(() => {
    (async () => {
      try {
        const supported = await ExpoSpeechRecognition.getSupportedLocales();
        console.log(supported);
        
        // supported.locales = array of locale strings like "en-US"
        // map them to labels (use Intl.DisplayNames or a small map)
        setSupportedLocales(mapLocalesToLabels(supported.locales));
      } catch (e) {
        // fallback to your hardcoded list
        setSupportedLocales(hardcodedList);
      }
    })();
  }, []);

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
        Alert.alert(
          "Permission required",
          "Microphone permission is required to record audio."
        );
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
    // mark start ts
    recordStartTsRef.current = Date.now();
    setRemainingMs(MAX_RECORD_MS);

    // start a countdown interval for UI
    if (countdownIntervalRef.current) {
      clearInterval(countdownIntervalRef.current);
    }
    countdownIntervalRef.current = setInterval(() => {
      const elapsed = Date.now() - (recordStartTsRef.current || Date.now());
      const rem = Math.max(MAX_RECORD_MS - elapsed, 0);
      setRemainingMs(rem);
    }, 100);

    // enforce max duration
    recordTimeoutRef.current = setTimeout(async () => {
      try {
        await stopListening();
      } catch { }
    }, MAX_RECORD_MS);

    // mark min duration (store timer id; when cleared we set to null)
    minDurationRef.current = setTimeout(() => {
      minDurationRef.current = null;
    }, MIN_RECORD_MS);

    // actually start recorder and speech engine
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
      // ensure UI timers cleaned
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

      await prepareAndStartRecorder();
      await Voice.start(locale);
      setIsListening(true);
    } catch (e) {
      console.error("startListening error", e);
      setError(String(e));
      setIsListening(false);
    }
  }

  async function stopListening() {
    try {
      // Respect minimum record time
      if (minDurationRef.current) return;
      // stop speech recognizer first
      try {
        await Voice.stop();
      } catch (err) {
        // ignore
      }
      await stopAndReleaseIfRecording();
      setIsListening(false);
      clearAllTimers();
    } catch (e) {
      console.error("stopListening error", e);
      setError(String(e));
    }
  }

  async function cancelTranscript() {
    // stops recording and clears transcript
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
      // Ensure recording/voice engines stopped before sending.
      try {
        await stopListening();
      } catch (err) {
        console.warn("failed to fully stop before send:", err);
      }

      // also ensure recorder released
      await stopAndReleaseIfRecording();

      const resp = await VoiceService.sendTranscriptOnly({
        transcript: textToSend,
        locale,
        token,
      });

      if (resp && resp.parsed) {
        onParsed(resp.parsed);
      }

      // clear transcript locally after success (per request)
      setPartialTranscript("");
      setFinalTranscript("");

      Alert.alert("Processed", "Transcript processed successfully.");
    } catch (err) {
      console.error("sendTranscript error", err);
      setError(String(err?.message || err));
      Alert.alert("Send failed", String(err?.message || err));
    } finally {
      setLoadingSend(false);
      // ensure UI state reset
      setIsListening(false);
      clearAllTimers();
    }
  }
  // compute displayText (unchanged)
  const displayText =
    partialTranscript && !finalTranscript ? partialTranscript : finalTranscript;

  // show X and ✓ only when recording OR when there is non-empty text (trimmed)
  const hasNonEmptyText = !!(displayText && String(displayText).trim());
  const showCancel = isListening || hasNonEmptyText;

  const s = styles(colors, {
    isListening,
    showCancel,
  });

  // a simple human-friendly remaining seconds
  const remainingSeconds = Math.ceil(remainingMs / 1000);

  // supported locales - add/remove as needed


  const selectedLabel =
    supportedLocales?.find((l) => l.value === locale)?.label || locale;

  // layout constants - width of the left language chip/button inside the text box
  const LANG_BUTTON_WIDTH = 150; // adjust if you change label length or padding
  const LANG_BUTTON_HEIGHT = 36; // adjust if you change label length or padding

  return (
    <View style={s.container}>
      <View
        style={[
          s.transcriptCard,
          {
            // increase minHeight slightly to accommodate the internal button
            minHeight: 110,
            paddingTop: 12,
            paddingLeft: 12,
            paddingRight: 12,
            paddingBottom: 12,
          },
        ]}
      >
        {/* Language button inside the transcript box: absolutely positioned */}
        <View
          style={{
            position: "absolute",
            left: 12,
            top: 12,
            zIndex: 5,
          }}
        >
          <TouchableOpacity
            onPress={() => setLocaleOpen((s) => !s)}
            style={{
              width: LANG_BUTTON_WIDTH,
              height: LANG_BUTTON_HEIGHT,
              borderRadius: 8,
              paddingHorizontal: 8,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              backgroundColor: colors.card,
              borderWidth: 1,
              borderColor: colors.border,
            }}
          >
            <Text numberOfLines={1} style={{ color: colors.text, flex: 1, marginRight: 6 }}>
              {selectedLabel}
            </Text>
            <Feather
              name={localeOpen ? "chevron-up" : "chevron-down"}
              size={16}
              color={colors.muted}
            />
          </TouchableOpacity>

          {/* dropdown list anchored under the button */}
          {localeOpen ? (
            <View
              style={{
                marginTop: 6,
                maxHeight: 160,
                width: LANG_BUTTON_WIDTH,
                borderRadius: 8,
                overflow: "hidden",
                borderWidth: 1,
                borderColor: colors.border,
                backgroundColor: colors.card,
              }}
            >
              <ScrollView>
                {supportedLocales?.map((l) => {
                  const isSel = l.value === locale;
                  return (
                    <TouchableOpacity
                      key={l.value}
                      onPress={() => {
                        setLocale(l.value);
                        setLocaleOpen(false);
                      }}
                      style={{
                        height: 40,
                        paddingHorizontal: 8,
                        justifyContent: "center",
                        flexDirection: "row",
                        alignItems: "center",
                        backgroundColor: isSel ? (Platform.OS === "ios" ? "#ffffff10" : colors.card) : "transparent",
                      }}
                    >
                      <Text style={{ color: colors.text, fontSize: 13, flex: 1 }}>
                        {l.label}
                      </Text>

                      {isSel ? (
                        <Feather name="check" size={16} color={colors.cta || colors.primary} />
                      ) : null}
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>
          ) : null}
        </View>

        {/* Multiline text input that starts to the right of the language button and wraps under it.
            We use paddingLeft equal to LANG_BUTTON_WIDTH + left margin (12) + some spacing (8)
            so all lines are offset and wrap under the button visually.
        */}
        <TextInput
          multiline
          placeholder="Speak or type..."
          placeholderTextColor={colors.muted}
          value={displayText}
          onChangeText={(txt) => {
            setFinalTranscript(txt);
            setPartialTranscript("");
          }}
          style={[
            s.transcriptInput,
            {
              color: colors.text,
              paddingLeft: 8, // button width + left margin + gap
              paddingTop: LANG_BUTTON_HEIGHT + 12,
              minHeight: 64,
            },
          ]}
          editable={!loadingSend}
        />

        {/* Timer and recording status */}
        <View
          style={{
            position: 'absolute',
            right: 12,
            top: 4,
            flexDirection: "row",
            justifyContent: "space-between",
            marginTop: 8,
          }}
        >
          {!loadingSend && <Text style={{ color: colors.muted, fontSize: 12 }}>
            {isListening ? `Recording — ${remainingSeconds}s left` : "Not recording"}
          </Text>}
          {loadingSend && <Text style={{ color: colors.muted, fontSize: 12 }}>{loadingSend ? "Sending..." : ""}</Text>}
        </View>
      </View>

      <View style={s.controlsRow}>
        {showCancel ? (
          <TouchableOpacity
            onPress={cancelTranscript}
            style={[s.sideBtn, s.sideBtnLeft]}
            disabled={loadingSend}
            accessibilityLabel="Discard transcript"
          >
            <Feather name="x" size={20} color={colors.text} />
          </TouchableOpacity>
        ) : (
          <View style={s.sideBtnPlaceholder} />
        )}

        <TouchableOpacity
          onPress={isListening ? stopListening : startListening}
          onLongPress={startListening}
          onPressOut={stopListening}
          activeOpacity={0.85}
          style={[s.micBtn, isListening ? s.micBtnActive : null]}
          accessibilityLabel={isListening ? "Stop recording" : "Start recording"}
        >
          <Feather name={isListening ? "mic-off" : "mic"} size={28} color={colors.text} />
        </TouchableOpacity>

        {showCancel ? (
          <TouchableOpacity
            onPress={sendTranscript}
            style={[s.sideBtn, s.sideBtnRight]}
            disabled={loadingSend}
            accessibilityLabel="Send transcript"
          >
            {loadingSend ? (
              <ActivityIndicator color={colors.text} />
            ) : (
              <Feather name="check" size={20} color={colors.text} />
            )}
          </TouchableOpacity>
        ) : (
          <View style={s.sideBtnPlaceholder} />
        )}
      </View>

      {error ? <Text style={[s.errorText, { color: colors.negative }]}>{error}</Text> : null}
    </View>
  );
}

const styles = (colors, opts = {}) =>
  StyleSheet.create({
    container: {
      gap: 8,
      width: "100%",
      alignItems: "center",
    },
    transcriptCard: {
      width: "100%",
      backgroundColor: "transparent",
      borderRadius: 12,
      padding: 12,
      minHeight: 100,
      borderWidth: 1,
      borderColor: colors.border || "#333",
    },
    transcriptInput: {
      // NOTE: left padding is set inline so it can be dynamically matched to LANG_BUTTON_WIDTH
      textAlignVertical: "top",
      fontSize: 16,
    },
    controlsRow: {
      flexDirection: "row",
      justifyContent: "center",
      alignItems: "center",
      marginTop: 12,
    },
    // mic button (center)
    micBtn: {
      width: 68,
      height: 68,
      borderRadius: 34,
      backgroundColor: colors.cta || colors.primary || "#00C49F",
      justifyContent: "center",
      alignItems: "center",
      marginHorizontal: 8,
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.12,
      shadowRadius: 4,
      elevation: 2,
    },
    micBtnActive: {
      backgroundColor: colors.negative || "#FF6B6B",
    },
    sideBtn: {
      width: 48,
      height: 48,
      borderRadius: 24,
      backgroundColor: colors.card || "#2a2a2a",
      justifyContent: "center",
      alignItems: "center",
      marginHorizontal: 6,
      borderWidth: 1,
      borderColor: colors.border || "#333",
    },
    sideBtnLeft: {},
    sideBtnRight: {},
    sideBtnPlaceholder: {
      width: 48,
      height: 48,
      borderRadius: 24,
      marginHorizontal: 6,
      opacity: 0,
    },
    errorText: {
      marginTop: 8,
      textAlign: "center",
    },
  });
