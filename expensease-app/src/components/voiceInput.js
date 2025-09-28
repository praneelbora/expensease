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
  useColorScheme,
} from "react-native";
import Voice from "@react-native-voice/voice";
import {
  useAudioRecorder,
  RecordingPresets,
  setAudioModeAsync,
  useAudioRecorderState,
  requestRecordingPermissionsAsync,
} from "expo-audio";
import * as FileSystem from "expo-file-system";
import { Feather } from "@expo/vector-icons";
import VoiceService from "services/VoiceService";

const MIN_RECORD_MS = 3 * 1000;
const MAX_RECORD_MS = 15 * 1000;

export default function VoiceInput({
  initialValue = "",
  locale = "en-US",
  onParsed = () => {},
  token = null,
}) {
  const scheme = useColorScheme();
  const textColor = scheme === "dark" ? "#fff" : "#000";

  const [isListening, setIsListening] = useState(false);
  const [partialTranscript, setPartialTranscript] = useState("");
  const [finalTranscript, setFinalTranscript] = useState(initialValue || "");
  const [loadingSend, setLoadingSend] = useState(false);
  const [error, setError] = useState(null);

  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recorderState = useAudioRecorderState(recorder);

  const recordTimeoutRef = useRef(null);
  const minDurationRef = useRef(null);

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
      Voice.destroy().then(Voice.removeAllListeners).catch(() => {});
      stopAndReleaseIfRecording();
      if (recordTimeoutRef.current) clearTimeout(recordTimeoutRef.current);
      if (minDurationRef.current) clearTimeout(minDurationRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    recorder.record();

    recordTimeoutRef.current = setTimeout(async () => {
      await stopListening();
    }, MAX_RECORD_MS);

    minDurationRef.current = setTimeout(() => {
      minDurationRef.current = null;
    }, MIN_RECORD_MS);
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
      return uri;
    } catch (err) {
      console.warn("stopAndReleaseIfRecording error", err);
      return null;
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
      if (minDurationRef.current) return;
      await Voice.stop();
      await stopAndReleaseIfRecording();
      setIsListening(false);
    } catch (e) {
      console.error("stopListening error", e);
      setError(String(e));
    }
  }

  async function cancelTranscript() {
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

      Alert.alert("Processed", "Transcript processed successfully.");
    } catch (err) {
      console.error("sendTranscript error", err);
      setError(String(err?.message || err));
      Alert.alert("Send failed", String(err?.message || err));
    } finally {
      setLoadingSend(false);
    }
  }

  const displayText =
    partialTranscript && !finalTranscript
      ? partialTranscript
      : finalTranscript;

  const showCancel = isListening || !!displayText;

  return (
    <View style={styles.container}>
      <View style={[styles.transcriptCard]}>
        <TextInput
          multiline
          placeholder="Speak or type..."
          value={displayText}
          onChangeText={(txt) => {
            setFinalTranscript(txt);
            setPartialTranscript("");
          }}
          style={[styles.transcriptInput, { color: textColor }]}
          editable={!loadingSend}
        />
      </View>

      <View style={styles.controlsRow}>
        {showCancel && (
          <TouchableOpacity
            onPress={cancelTranscript}
            style={styles.sideBtn}
            disabled={loadingSend}
          >
            <Feather name="x" size={22} color="#fff" />
          </TouchableOpacity>
        )}

        <TouchableOpacity
          onPress={isListening ? stopListening : startListening}
          onLongPress={startListening}
          onPressOut={stopListening}
          style={[styles.micBtn, isListening && styles.micBtnActive]}
        >
          <Feather name="mic" size={28} color="#fff" />
        </TouchableOpacity>

        {showCancel && (<TouchableOpacity
          onPress={sendTranscript}
          style={styles.sideBtn}
          disabled={loadingSend}
        >
          {loadingSend ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Feather name="check" size={22} color="#fff" />
          )}
        </TouchableOpacity>)}
      </View>

      {error ? <Text style={styles.errorText}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 8 },
  label: { color: "#9A9A9A", marginBottom: 8, fontSize: 13, textAlign: "center" },
  transcriptCard: {
    backgroundColor: "transparent",
    borderRadius: 12,
    padding: 12,
    minHeight: 80,
  },
  transcriptInput: {
    minHeight: 64,
    textAlignVertical: "top",
    fontSize: 16,
  },
  controlsRow: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    marginTop: 12,
    gap: 20, // reduce space between buttons
  },
  micBtn: {
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: "#00C49F",
    justifyContent: "center",
    alignItems: "center",
  },
  micBtnActive: {
    backgroundColor: "#FF6B6B",
  },
  sideBtn: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: "#2a2a2a",
    justifyContent: "center",
    alignItems: "center",
  },
  errorText: { color: "#FF6B6B", marginTop: 8, textAlign: "center" },
});
