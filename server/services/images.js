// services/receiptParser.js
// Pluggable receipt parser: tries Google Vision (if key configured), then Gemini (if configured),
// otherwise uses a conservative fallback that returns rawText only.
//
// Install optional dependencies if you plan to use them:
//   npm i @google-cloud/vision
//   npm i @google/genai
//   npm i axios  (used for fallback fetches if needed)

const fs = require("fs");
const path = require("path");

let visionClient = null;
try {
  const { ImageAnnotatorClient } = require("@google-cloud/vision");
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS || process.env.GOOGLE_CLOUD_VISION_KEY) {
    // If you set GOOGLE_APPLICATION_CREDENTIALS to service account json path,
    // the client will pick it up automatically.
    visionClient = new ImageAnnotatorClient();
  }
} catch (e) {
  // not installed or not configured
  visionClient = null;
}

let GoogleGenAI = null;
try {
  GoogleGenAI = require("@google/genai").GoogleGenAI || require("@google/genai");
} catch (e) {
  GoogleGenAI = null;
}

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-1.5-mini";

async function readLocalFileAsBase64(filePath) {
  const buff = await fs.promises.readFile(filePath);
  return buff.toString("base64");
}

/**
 * parseReceipt(fileObj)
 * fileObj: { path, mimetype, originalname, url? }
 * Returns: { rawText, items: [{name, amount}], totalAmount }
 */

async function parseReceipt(fileObj) {
  if (!fileObj) throw new Error("fileObj required");

  // 1) OCR using Google Vision if available
  if (visionClient) {
    try {
      const content = fileObj.path ? await readLocalFileAsBase64(fileObj.path) : null;

      const request = content
        ? { image: { content } }
        : { image: { source: { imageUri: fileObj.url } } };

      const [result] = await visionClient.textDetection(request);
      const fullText = result?.fullTextAnnotation?.text || (result && result.textAnnotations && result.textAnnotations[0] && result.textAnnotations[0].description) || "";
      // proceed to try structured parsing using Gemini (if available) or simple parsing
      const structured = await tryStructuredParseWithGenAI(fullText, fileObj) || simpleExtract(fullText);
      return structured;
    } catch (e) {
      console.warn("vision OCR failed", e.message || e);
      // fallthrough to next option
    }
  }

  // 2) If Gemini configured, fetch image OCR via a simple OCR library or remote OCR, then ask Gemini to parse.
  // For simplicity, if there's a URL we can send the URL to Gemini (if allowed), else fallback
  if (GoogleGenAI && GEMINI_API_KEY) {
    try {
      // If local file, do a naive OCR using tesseract.js would be possible, but it's heavy.
      // Here we'll do a simple flow: if fileObj.url exists let Gemini parse from "image_url: <url>" prompt,
      // otherwise we will read the file and send base64 as "image_base64: <...>" if your model supports it.
      // NOTE: adjust according to your policies and model support.
      const textForModel = fileObj.url ? `image_url: ${fileObj.url}` : `image_base64_provided_elsewhere`; // placeholder
      const parsed = await parseWithGeminiForReceipt(textForModel, fileObj);
      if (parsed) return parsed;
    } catch (e) {
      console.warn("Gemini parse failed", e.message || e);
    }
  }

  // 3) Last fallback: if we have local file, try to extract text using tesseract.js (if installed)
  try {
    const tryTesseract = async () => {
      try {
        const { createWorker } = require("tesseract.js");
        const worker = createWorker();
        await worker.load();
        await worker.loadLanguage("eng");
        await worker.initialize("eng");
        const { data } = await worker.recognize(fileObj.path);
        await worker.terminate();
        const rawText = data?.text || "";
        return simpleExtract(rawText);
      } catch (e) {
        console.warn("tesseract failed or not installed:", e.message || e);
        return null;
      }
    };

    const tesseractResult = await tryTesseract();
    if (tesseractResult) return tesseractResult;
  } catch (e) {
    // ignore
  }

  // 4) conservative fallback - no OCR available: return minimal object
  return {
    rawText: "",
    items: [],
    totalAmount: null,
  };
}

/**
 * naive simpleExtract: attempts to detect amounts from text and build items array.
 * This is intentionally conservative.
 */
function simpleExtract(rawText) {
  const lines = (rawText || "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const amountRegex = /(?:(?:₹|Rs\.?|INR)\s?)?([0-9]+(?:[.,][0-9]{1,2})?)/g;

  const items = [];
  let totalAmount = null;
  for (const line of lines) {
    // try to find any currency number in the line
    let m;
    while ((m = amountRegex.exec(line)) !== null) {
      const numStr = m[1].replace(",", "");
      const num = parseFloat(numStr);
      if (!isNaN(num)) {
        items.push({ name: line.replace(m[0], "").trim().slice(0, 120), amount: num });
      }
    }
    // look for "total" keyword
    if (/total/i.test(line) && (m = amountRegex.exec(line))) {
      const numStr = m[1].replace(",", "");
      totalAmount = parseFloat(numStr);
    }
  }

  if (!totalAmount && items.length) {
    totalAmount = items.reduce((s, it) => s + (it.amount || 0), 0);
  }

  return { rawText: lines.join("\n"), items, totalAmount };
}

/**
 * Try to parse with Gemini by crafting a prompt (if Gemini available).
 * Minimal sample — adapt to your prompt engineering needs.
 */
async function parseWithGeminiForReceipt(plainTextOrImagePointer, fileObj) {
  if (!GoogleGenAI || !GEMINI_API_KEY) return null;
  try {
    const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
    const prompt = [
      `You are a strict JSON extractor. Parse the following receipt OCR or image pointer into JSON with keys:`,
      `{"rawText": "...", "items":[{"name":"", "amount": 0}], "totalAmount": 0}`,
      `Input: ${plainTextOrImagePointer}`,
      `Return ONLY valid JSON. Do not add commentary. If you cannot find amounts, return empty items and null totalAmount.`,
    ].join("\n\n");

    const req = { model: GEMINI_MODEL, contents: prompt };
    const resp = await ai.models.generateContent(req);

    // try to extract JSON the same robust way as in your voice route
    let textOut = null;
    if (resp && typeof resp.text === "string") textOut = resp.text;
    if (!textOut) {
      const candidates = resp?.candidates || resp?.output || null;
      if (Array.isArray(candidates) && candidates.length) {
        if (candidates[0]?.output_text) textOut = candidates[0].output_text;
        else if (candidates[0]?.text) textOut = candidates[0].text;
        else if (Array.isArray(candidates[0]?.content)) textOut = candidates[0].content.map(p => (p?.text || (typeof p === "string" ? p : ""))).join(" ");
      }
    }
    if (!textOut) {
      try {
        textOut = JSON.stringify(resp);
      } catch (e) { textOut = null; }
    }
    if (!textOut) return null;

    // extract JSON substring
    const m = textOut.match(/\{[\s\S]*\}/);
    if (!m) return null;
    const parsed = JSON.parse(m[0]);
    return parsed;
  } catch (e) {
    console.warn("gemini parse error:", e?.message || e);
    return null;
  }
}

module.exports = {
  parseReceipt,
  simpleExtract,
  parseWithGeminiForReceipt,
};
