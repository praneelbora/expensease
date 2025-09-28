// src/services/VoiceService.js
import { api } from "../utils/api";

/**
 * VoiceService
 * - Uses the same `api` wrapper as other services in the app (assumed axios instance)
 * - sendVoiceMultipart uses multipart/form-data and is compatible with React Native FormData
 *
 * Endpoints (server):
 *  POST /v1/voice/process        -> accepts 'file' (audio) + 'transcript' + 'locale'
 *  GET  /v1/voice/list           -> list recent processed transcripts (optional)
 *  GET  /v1/voice/status/:id     -> get status / parsed result for given job id (optional)
 *  DELETE /v1/voice/:id          -> delete audio/record (optional)
 *  POST /v1/voice/retranscribe   -> request re-transcription (audio_url or id) (optional)
 *
 * Adjust endpoints if your server differs.
 */

const BASE = "/v1/voice";

/**
 * Send only text transcript to server for parsing (no audio)
 * body: { transcript: string, locale?: string }
 */
export const sendTranscriptOnly = ({transcript, locale}) =>
  api.post(`${BASE}/process`, { transcript, locale });

/**
 * Send transcript + audio file (multipart/form-data).
 * For React Native, `file` should be an object: { uri, name, type }
 *
 * Example RN file:
 *  { uri: localUri, name: 'rec-169000.m4a', type: 'audio/m4a' }
 *
 * NOTE: Do NOT set Content-Type header when using RN FormData; let the platform set it.
 */
export const sendVoiceMultipart = async ({ file, transcript = "", locale = "" }) => {
  // Build FormData (works both RN and browser)
  const fd = new FormData();
  if (transcript) fd.append("transcript", transcript);
  if (locale) fd.append("locale", locale);

  if (file) {
    // file expected as { uri, name, type } from expo-file-system or react-native
    fd.append("file", {
      uri: file.uri,
      name: file.name || (file.uri && file.uri.split("/").pop()) || "recording.m4a",
      type: file.type || "audio/m4a",
    });
  }

  // Use api.post but DO NOT set Content-Type; axios will pick correct boundary if browser/node supports it.
  // If your `api` wrapper forces Content-Type, you can call fetch instead.
  return api.post(`${BASE}/process`, fd, {
    // For axios, don't set content-type header so axios detects boundary:
    headers: {
      "Accept": "application/json",
    },
    // If your api wrapper supports removing default header 'Content-Type', ensure that's applied.
  });
};

/**
 * Fetch recent parsed transcripts / jobs (server must implement)
 * Query params: ?limit=50&skip=0
 */
export const fetchRecentVoiceJobs = (limit = 50, skip = 0) =>
  api.get(`${BASE}/list?limit=${limit}&skip=${skip}`);

/**
 * Get processing status or parsed result for a given job/audio id
 */
export const getVoiceJobStatus = (jobId) =>
  api.get(`${BASE}/status/${jobId}`);

/**
 * Delete an uploaded audio or job
 */
export const deleteVoiceJob = (jobId) =>
  api.delete(`${BASE}/${jobId}`);

/**
 * Request server to re-transcribe/re-parse (for low-confidence cases).
 * payload: { jobId } or { audioUrl } depending on server.
 */
export const requestRetranscribe = (payload) =>
  api.post(`${BASE}/retranscribe`, payload);

export default {
  sendTranscriptOnly,
  sendVoiceMultipart,
  fetchRecentVoiceJobs,
  getVoiceJobStatus,
  deleteVoiceJob,
  requestRetranscribe,
};
