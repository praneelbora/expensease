// routes/v1/voice.js
// Accepts a client-provided transcript (text) and uses Gemini (Google GenAI) free model
// to extract a strict JSON expense object. No audio/file handling in this route.
//
// POST /v1/voice/process
// Body: { transcript: "<user transcript>", locale?: "hi-IN" }
// Auth: uses your existing auth middleware

const express = require("express");
const router = express.Router();
const auth = require("../../middleware/auth"); // adjust path if needed
const buildUnifiedVoicePrompt = require("./prompt");
const PaymentMethod = require('../../models/PaymentMethod');
const Group = require('../../models/Group');
const User = require('../../models/User');

// Use the official SDK as in docs. Make sure @google/genai is installed in your project:
//   npm i @google/genai
let GoogleGenAI;
try {
    GoogleGenAI = require("@google/genai").GoogleGenAI || require("@google/genai");
} catch (e) {
    // If the package isn't installed this will throw at startup when route is used.
    // The try/catch avoids crashing early; we'll throw a clear error when attempting to call.
    GoogleGenAI = null;
}

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-1.5-mini"; // choose small/free-ish model

// ---------------- helpers ----------------

function makeConservativeParse(rawText) {
    return {
        amount: null,
        currency: null,
        date: null,
        description: rawText || null,
        category: "other",
        payee: null,
        confidence: 0.0,
        raw_transcript: rawText || "",
    };
}

/**
 * Call Gemini via @google/genai SDK.
 * Returns parsed JS object (throws on parse failure).
 */
async function parseWithGemini(rawText, paymentAccounts, friends, groups) {
    if (!GEMINI_API_KEY) {
        throw new Error("GEMINI_API_KEY not configured");
    }
    if (!GoogleGenAI) {
        throw new Error(
            "@google/genai SDK not installed. Install with: npm i @google/genai"
        );
    }

    const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

    const prompt = buildUnifiedVoicePrompt(rawText, paymentAccounts, friends, groups);
    console.log('prompt: ', prompt);



    // Use the generateContent API per docs sample
    const req = {
        model: GEMINI_MODEL,
        contents: prompt,
    };

    const resp = await ai.models.generateContent(req);

    // SDK shapes vary by version. Try common fields in order.
    // 1) resp.text (simple)
    if (resp && typeof resp.text === "string" && resp.text.trim()) {
        return tryParseJsonFromText(resp.text);
    }

    // 2) resp.output or resp.candidates
    // candidate.content may be an array of parts
    try {
        const candidates = resp?.candidates || resp?.output || null;
        if (Array.isArray(candidates) && candidates.length > 0) {
            // try several common nested shapes
            for (const c of candidates) {
                // some SDK returns c.output_text
                if (c?.output_text && typeof c.output_text === "string") {
                    const p = tryParseJsonFromText(c.output_text);
                    if (p) return p;
                }
                // some return content.parts[0].text
                if (c?.content && Array.isArray(c.content)) {
                    // content items may be {type:'output_text', text: '...'} or {text: '...'}
                    for (const part of c.content) {
                        if (typeof part?.text === "string" && part.text.trim()) {
                            const p = tryParseJsonFromText(part.text);
                            if (p) return p;
                        }
                        if (typeof part === "string" && part.trim()) {
                            const p = tryParseJsonFromText(part);
                            if (p) return p;
                        }
                    }
                }
                // fallback try c.text
                if (typeof c?.text === "string" && c.text.trim()) {
                    const p = tryParseJsonFromText(c.text);
                    if (p) return p;
                }
            }
        }
    } catch (e) {
        // swallow and fallthrough to final attempt
        console.warn("unexpected Gemini response shape:", e?.message || e);
    }

    // As last attempt, try to stringify resp and extract JSON substring
    const bulkText = JSON.stringify(resp || "", null, 2);
    const maybe = tryParseJsonFromText(bulkText);
    if (maybe) return maybe;

    throw new Error("Gemini did not return parseable JSON");
}

/**
 * Try to extract/parse a JSON object from a text blob.
 * Returns object on success or throws.
 */
function tryParseJsonFromText(text) {
    if (!text || typeof text !== "string") return null;
    const cleaned = text.trim()
        .replace(/^[\s`]*```(?:json)?\s*/i, "") // remove code fence opening
        .replace(/```[\s]*$/i, "") // remove closing fence
        .trim();

    // If entire cleaned string is JSON parseable, return it
    try {
        const parsed = JSON.parse(cleaned);
        if (parsed && typeof parsed === "object") return parsed;
    } catch (e) {
        // try to extract first {...} substring
        const m = cleaned.match(/\{[\s\S]*\}/);
        if (m) {
            try {
                const parsed2 = JSON.parse(m[0]);
                if (parsed2 && typeof parsed2 === "object") return parsed2;
            } catch (ee) {
                // fallthrough
            }
        }
    }
    // not parseable
    return null;
}

// ---------------- route ----------------
router.post("/process", auth, async (req, res) => {
    try {
        const user = await User.findById(req.user.id).populate('friends', '_id name');

        const today = new Date().toDateString();
        const last = user.lastVoiceUsedAt ? user.lastVoiceUsedAt.toDateString() : null;

        if (today !== last) {
            user.dailyVoiceCount = 0; // reset for new day
        }

        // default = 3 if no custom limit
        const limit = user.dailyVoiceLimit || 3;

        if (user.dailyVoiceCount >= limit) {
            return res.status(429).json({
                error: "quota_exceeded",
                message: `Daily limit of ${limit} requests reached. Try again tomorrow.`,
            });
        }

        // increment usage
        user.dailyVoiceCount += 1;
        user.totalVoiceCount += 1;
        user.lastVoiceUsedAt = new Date();
        await user.save();

        const transcriptFromClient = (req.body.transcript || "").toString().trim();
        const locale = req.body.locale || null;

        if (!transcriptFromClient) {
            return res.status(400).json({ error: "missing_transcript" });
        }


        let processorUsed = "conservative";
        const paymentAccounts = await PaymentMethod.find(
            { userId: req.user.id },
            "_id label type isDefaultSend isDefaultReceive"
        ).lean();
        console.log(req.user.id, paymentAccounts);
        const friends = user.friends
        const groups = await Group.find({ members: req.user.id })
            .populate('members', 'name')
        let parsedResult;
        try {
            parsedResult = await parseWithGemini(transcriptFromClient, paymentAccounts, friends, groups);
            console.log(parsedResult);

        } catch (err) {
            parsedResult = makeConservativeParse(transcriptFromClient);
        }



        return res.json({
            success: true,
            processor: processorUsed,
            detectedLanguage: locale || null,
            serverTranscript: transcriptFromClient,
            parsed: parsedResult,
        });
    } catch (err) {
        console.error("voice/process error", err);
        return res
            .status(500)
            .json({ error: "server_error", detail: String(err?.message || err) });
    }
});

module.exports = router;
