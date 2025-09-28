// routes/v1/voice.js (instrumented timing)
const express = require("express");
const router = express.Router();
const auth = require("../../middleware/auth"); // adjust path if needed
const buildUnifiedVoicePrompt = require("./prompt");
const PaymentMethod = require('../../models/PaymentMethod');
const Group = require('../../models/Group');
const User = require('../../models/User');

const { performance } = require('perf_hooks');

// Gemini SDK handling (unchanged)
let GoogleGenAI;
try {
    GoogleGenAI = require("@google/genai").GoogleGenAI || require("@google/genai");
} catch (e) {
    GoogleGenAI = null;
}

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-1.5-mini";

// keep your helper functions (makeConservativeParse, tryParseJsonFromText) unchanged
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

function tryParseJsonFromText(text) {
    if (!text || typeof text !== "string") return null;
    const cleaned = text.trim()
        .replace(/^[\s`]*```(?:json)?\s*/i, "")
        .replace(/```[\s]*$/i, "")
        .trim();

    try {
        const parsed = JSON.parse(cleaned);
        if (parsed && typeof parsed === "object") return parsed;
    } catch (e) {
        const m = cleaned.match(/\{[\s\S]*\}/);
        if (m) {
            try {
                const parsed2 = JSON.parse(m[0]);
                if (parsed2 && typeof parsed2 === "object") return parsed2;
            } catch (ee) {}
        }
    }
    return null;
}

/**
 * Instrumented wrapper for parseWithGemini:
 * returns { result, timings: { promptMs, networkMs, parseMs, totalMs } }
 */
async function parseWithGeminiInstrumented(rawText, paymentAccounts, friends, groups) {
    const timings = {};
    const tStart = performance.now();

    // build prompt timing
    const tPromptStart = performance.now();
    const prompt = buildUnifiedVoicePrompt(rawText, paymentAccounts, friends, groups);
    const tPromptEnd = performance.now();
    timings.promptMs = tPromptEnd - tPromptStart;

    if (!GEMINI_API_KEY) {
        throw new Error("GEMINI_API_KEY not configured");
    }
    if (!GoogleGenAI) {
        throw new Error(
            "@google/genai SDK not installed. Install with: npm i @google/genai"
        );
    }

    const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

    // network call timing
    const req = {
        model: GEMINI_MODEL,
        contents: prompt,
    };

    let resp;
    const tNetworkStart = performance.now();
    resp = await ai.models.generateContent(req);
    const tNetworkEnd = performance.now();
    timings.networkMs = tNetworkEnd - tNetworkStart;

    // parse timing
    const tParseStart = performance.now();
    // reuse your parsing logic (tryParseJsonFromText + candidate parsing)
    // 1) simple resp.text
    if (resp && typeof resp.text === "string" && resp.text.trim()) {
        const parsed = tryParseJsonFromText(resp.text);
        const tParseEnd = performance.now();
        timings.parseMs = tParseEnd - tParseStart;
        timings.totalMs = performance.now() - tStart;
        return { result: parsed, timings };
    }

    // 2) candidates / output shapes
    try {
        const candidates = resp?.candidates || resp?.output || null;
        if (Array.isArray(candidates) && candidates.length > 0) {
            for (const c of candidates) {
                if (c?.output_text && typeof c.output_text === "string") {
                    const p = tryParseJsonFromText(c.output_text);
                    if (p) {
                        const tParseEnd = performance.now();
                        timings.parseMs = tParseEnd - tParseStart;
                        timings.totalMs = performance.now() - tStart;
                        return { result: p, timings };
                    }
                }
                if (c?.content && Array.isArray(c.content)) {
                    for (const part of c.content) {
                        if (typeof part?.text === "string" && part.text.trim()) {
                            const p = tryParseJsonFromText(part.text);
                            if (p) {
                                const tParseEnd = performance.now();
                                timings.parseMs = tParseEnd - tParseStart;
                                timings.totalMs = performance.now() - tStart;
                                return { result: p, timings };
                            }
                        }
                        if (typeof part === "string" && part.trim()) {
                            const p = tryParseJsonFromText(part);
                            if (p) {
                                const tParseEnd = performance.now();
                                timings.parseMs = tParseEnd - tParseStart;
                                timings.totalMs = performance.now() - tStart;
                                return { result: p, timings };
                            }
                        }
                    }
                }
                if (typeof c?.text === "string" && c.text.trim()) {
                    const p = tryParseJsonFromText(c.text);
                    if (p) {
                        const tParseEnd = performance.now();
                        timings.parseMs = tParseEnd - tParseStart;
                        timings.totalMs = performance.now() - tStart;
                        return { result: p, timings };
                    }
                }
            }
        }
    } catch (e) {
        console.warn("unexpected Gemini response shape:", e?.message || e);
    }

    // last attempt: stringify and extract JSON
    const tLastParseStart = performance.now();
    const bulkText = JSON.stringify(resp || "", null, 2);
    const maybe = tryParseJsonFromText(bulkText);
    const tLastParseEnd = performance.now();
    timings.parseMs = (tLastParseEnd - tLastParseStart) + (tParseStart ? (tParseStart - tLastParseStart) : 0);
    timings.totalMs = performance.now() - tStart;

    if (maybe) return { result: maybe, timings };

    throw new Error("Gemini did not return parseable JSON");
}

// ---------------- route ----------------
router.post("/process", auth, async (req, res) => {
    const globalStart = performance.now();
    try {
        const tUserFetchStart = performance.now();
        const user = await User.findById(req.user.id).populate('friends', '_id name');
        const tUserFetchEnd = performance.now();
        const userFetchMs = tUserFetchEnd - tUserFetchStart;

        const today = new Date().toDateString();
        const last = user.lastVoiceUsedAt ? user.lastVoiceUsedAt.toDateString() : null;

        if (today !== last) {
            user.dailyVoiceCount = 0;
        }

        const limit = user.dailyVoiceLimit || 3;

        // increment usage
        const tIncrementStart = performance.now();
        user.dailyVoiceCount += 1;
        user.lastVoiceUsedAt = new Date();
        await user.save();
        const tIncrementEnd = performance.now();
        const userSaveMs = tIncrementEnd - tIncrementStart;

        const transcriptFromClient = (req.body.transcript || "").toString().trim();
        const locale = req.body.locale || null;
        if (!transcriptFromClient) {
            return res.status(400).json({ error: "missing_transcript" });
        }

        const tPaymentFetchStart = performance.now();
        const paymentAccounts = await PaymentMethod.find(
            { userId: req.user.id },
            "_id label type isDefaultSend isDefaultReceive"
        ).lean();
        const tPaymentFetchEnd = performance.now();
        const paymentFetchMs = tPaymentFetchEnd - tPaymentFetchStart;

        const friends = user.friends;
        const tGroupFetchStart = performance.now();
        const groups = await Group.find({ members: req.user.id }).populate('members', 'name');
        const tGroupFetchEnd = performance.now();
        const groupFetchMs = tGroupFetchEnd - tGroupFetchStart;

        let parsedResult;
        let geminiTimings = null;
        try {
            const tParseStart = performance.now();
            const { result, timings } = await parseWithGeminiInstrumented(transcriptFromClient, paymentAccounts, friends, groups);
            parsedResult = result;
            geminiTimings = timings;
            const tParseEnd = performance.now();
            // parseWithGeminiInstrumented already measures internal timings.
            var parseTotalMs = tParseEnd - tParseStart;
        } catch (err) {
            parsedResult = makeConservativeParse(transcriptFromClient);
        }

        const overallMs = performance.now() - globalStart;

        // Build Server-Timing header (comma-separated metric=ms)
        const serverTiming = [
            `userFetch;dur=${userFetchMs.toFixed(1)}`,
            `userSave;dur=${userSaveMs.toFixed(1)}`,
            `paymentFetch;dur=${paymentFetchMs.toFixed(1)}`,
            `groupFetch;dur=${groupFetchMs.toFixed(1)}`,
        ];
        if (geminiTimings) {
            serverTiming.push(`prompt;dur=${geminiTimings.promptMs.toFixed(1)}`);
            serverTiming.push(`network;dur=${geminiTimings.networkMs.toFixed(1)}`);
            serverTiming.push(`parse;dur=${geminiTimings.parseMs.toFixed(1)}`);
        }
        serverTiming.push(`total;dur=${overallMs.toFixed(1)}`);
        res.set('Server-Timing', serverTiming.join(', '));

        // friendly structured log
        console.log("voice/process timings (ms):", {
            userFetch: userFetchMs.toFixed(1),
            userSave: userSaveMs.toFixed(1),
            paymentFetch: paymentFetchMs.toFixed(1),
            groupFetch: groupFetchMs.toFixed(1),
            gemini: geminiTimings,
            overall: overallMs.toFixed(1),
        });

        return res.json({
            success: true,
            processor: "conservative",
            detectedLanguage: locale || null,
            serverTranscript: transcriptFromClient,
            parsed: parsedResult,
            timings: {
                userFetch: Number(userFetchMs.toFixed(1)),
                userSave: Number(userSaveMs.toFixed(1)),
                paymentFetch: Number(paymentFetchMs.toFixed(1)),
                groupFetch: Number(groupFetchMs.toFixed(1)),
                gemini: geminiTimings,
                overall: Number(overallMs.toFixed(1)),
            },
        });
    } catch (err) {
        console.error("voice/process error", err);
        return res
            .status(500)
            .json({ error: "server_error", detail: String(err?.message || err) });
    }
});

module.exports = router;
