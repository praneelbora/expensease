// routes/receipts.js
const express = require("express");
const router = express.Router();
const multer = require("multer");
const sharp = require("sharp");
const { GoogleGenAI } = require("@google/genai");

const auth = require("../../middleware/auth");
const User = require("../../models/User");
const Receipt = require("../../models/Receipt");
const { uploadBufferToS3 } = require("../../services/s3");
// AWS SDK v3 imports for signed URL
const { S3Client, GetObjectCommand } = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");

// create S3 client (uses env vars). Ensure AWS_REGION, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY are set.
const s3 = new S3Client({
  region: process.env.AWS_REGION || "us-east-1",
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});


const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-1.5-flash";
const GEMINI_PAID_API_KEY = process.env.GEMINI_PAID_API_KEY || null;
const GEMINI_PAID_MODEL = process.env.GEMINI_PAID_MODEL || null;

if (!GEMINI_API_KEY) {
    console.error("⚠️ GEMINI_API_KEY not set in environment variables");
}

// ---------- multer (memory) ----------
const upload = multer({ storage: multer.memoryStorage() });

// ---------- JSON Parser Helper ----------
function tryParseJsonFromText(text) {
    if (!text || typeof text !== "string") return null;
    const cleaned = text
        .trim()
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
            } catch { }
        }
    }
    return { rawText: cleaned };
}

// ---------- Cost Estimator ----------
function estimateGeminiCost(promptLength, outputLength, model = "gemini-1.5-flash") {
    const pricing = {
        "gemini-1.5-flash": { input: 0.000075, output: 0.00030 },
        "gemini-1.5-pro": { input: 0.00025, output: 0.0010 },
        "gemini-2.5-flash": { input: 0.000075, output: 0.00030 },
    };
    const rate = pricing[model] || pricing["gemini-1.5-flash"];
    const cost = (promptLength * rate.input + outputLength * rate.output) * 89 / 1000;
    return cost;
}

function buildPrompt() {
    const today = new Date().toISOString().split("T")[0];
    const allowedCategories = [
        "Default", "Education", "Donate", "Electronics", "Entertainment",
        "Food & Drinks", "Games", "Gift", "Groceries", "Heart", "Health Care",
        "Insurance", "Investment", "House", "General", "Office", "Religion",
        "Shopping", "Sports", "Subscriptions", "Transport", "Travel", "Pets"
    ];

    return `
You are a STRICT JSON-only receipt parser. Output EXACTLY one JSON object and NOTHING else.
Follow the schema and rules precisely. Use null for unknown values and empty arrays where appropriate.
Do NOT produce any explanatory text, headings, or code fences.

SCHEMA (top-level):
{
  "rawText": string | null,
  "items": [
    {
      "id": string | null,
      "name": string | null,
      "quantity": number | null,
      "amount": number | null,        // line total (quantity * unitPrice or provided)
      "unitPrice": number | null,
      "category": string | null
    }
  ],
  "subtotal": number | null,
  "tax": number | null,
  "taxBreakdown": { "sgst": number | null, "cgst": number | null, "igst": number | null } | null,
  "serviceCharge": number | null,         // absolute amount (preferred if present)
  "serviceChargePercent": number | null,  // percentage if present on receipt (0-100), null otherwise
  "tip": number | null,
  "discount": number | null,
  "totalAmount": number | null,
  "currency": string | null,        // 3-letter ISO or null
  "date": string | null,            // ISO YYYY-MM-DD or null (see rules)
  "merchant": { "name": string | null, "address": string | null } | null,
  "category": string | null,        // one of allowed categories or null
  "notes": string | null
}

IMPORTANT PARSING RULES (be conservative):
1) GENERAL:
 - Return EXACTLY one JSON object that conforms to the schema above.
 - Use null for unknown or not-determinable values.
 - Numbers must be JSON numbers (no strings). Round to two decimals for currency/amounts.
 - Use empty arrays when appropriate, not null (for items).
 - If unsure, prefer null over guessing.

2) AMOUNT & CURRENCY:
 - Parse totalAmount if present and return as number rounded to 2 decimals.
 - Currency must be a 3-letter ISO code (INR, USD, etc.) if present in text; otherwise null.
 - If no numeric amount can be confidently found, set totalAmount to null.
 - For line items, amounts must be numeric. Normalize numbers that include thousand separators (e.g. "1,234.50" -> 1234.5).

3) DATE RULES:
 - Today is ${today}.
 - If the receipt explicitly says "yesterday", set date to ISO for yesterday.
 - If it says "today" or no explicit date found, set date to null (do NOT assume today).
 - Convert spoken or printed explicit dates to ISO YYYY-MM-DD when possible; if ambiguous, set date to null.

4) ITEMS:
 - For each item, set quantity (number) if detectable; otherwise null.
 - If only a line total is available, set quantity = 1 and unitPrice = amount.
 - unitPrice should be the per-unit price if you can infer it; otherwise null.
 - Item id may be null if not present.

5) TAX / BREAKDOWN:
 - If you detect SGST/CGST/IGST, put numbers into taxBreakdown fields; otherwise taxBreakdown may be null.
 - Top-level tax should be the total tax numeric value if derivable; else null.

6) SERVICE CHARGE (NEW):
 - If receipt shows an absolute service charge amount, set serviceCharge to that numeric value (rounded to 2 decimals) and serviceChargePercent to null unless a percent is also printed.
 - If receipt shows a service charge *percent* (e.g. "Service Charge 10%") but no absolute amount:
     • If subtotal is present or reliably derivable, compute serviceCharge = round(subtotal * percent / 100, 2) and set serviceChargePercent to the percent value.
     • If subtotal is NOT available or uncertain, set serviceCharge to null and serviceChargePercent to the parsed percent.
 - If both absolute amount and percent are present, return the absolute amount in serviceCharge and also populate serviceChargePercent if the percent is printed.
 - If no service charge info present, set both serviceCharge and serviceChargePercent to null.

7) CURRENCY / NUMBERS:
 - Remove currency symbols and thousands separators before parsing numbers.
 - Always return numeric types for amounts and round to two decimals.

8) MERCHANT:
 - Provide merchant.name and merchant.address where present; otherwise set to null.

9) CATEGORY:
 - If you can infer category reliably, return one of these exact strings:
   ${JSON.stringify(allowedCategories)}
 - Otherwise set category to null.

10) RAW OCR:
 - rawText MUST contain the full text you extracted / OCR'd from the image (string). If you cannot extract any OCR text, set rawText to null.

OUTPUT EXAMPLE:
{
  "rawText": "AGENT JACKS ... Bill Total : 9,176.00",
  "items": [
    { "id": null, "name": "PANEER CHILI", "quantity": 3, "amount": 1140.00, "unitPrice": 380.00, "category": "Food & Drinks" }
  ],
  "subtotal": 9000.00,
  "tax": 436.98,
  "taxBreakdown": { "sgst": 218.49, "cgst": 218.49, "igst": null },
  "serviceCharge": 794.50,
  "serviceChargePercent": 10.00,
  "tip": 0,
  "discount": 0,
  "totalAmount": 9176.00,
  "currency": "INR",
  "date": "2025-09-20",
  "merchant": { "name": "AGENT JACKS", "address": "R CITY MALL GHATKOPAR" },
  "category": "Food & Drinks",
  "notes": null
}

If you cannot determine a field confidently, set it to null. Return ONLY the JSON object.
`.trim();
}

// ---------- Upload + parse ----------
router.post("/", auth, upload.single("image"), async (req, res) => {
    let receipt = null;
    try {
        if (!req.file) {
            return res.status(400).json({ error: "no_image", message: "Please upload an image" });
        }

        // Pick model/API key by user tier
        const user = await User.findById(req.user.id).lean();
        const isPaid = !!(user && user.paid === true);
        const apiKeyToUse = isPaid ? (GEMINI_PAID_API_KEY || GEMINI_API_KEY) : GEMINI_API_KEY;
        const modelName = isPaid ? (GEMINI_PAID_MODEL || GEMINI_MODEL) : GEMINI_MODEL;

        // Normalize to JPEG (rotate by EXIF, compress)
        const normalized = await sharp(req.file.buffer)
            .rotate()
            .jpeg({ quality: 82 })
            .toBuffer();

        // Upload to S3
        const s3Info = await uploadBufferToS3({
            buffer: normalized,
            contentType: "image/jpeg",
            userId: req.user.id,
            originalName: req.file.originalname,
        });

        // Create a Receipt doc with status=processing
        receipt = await Receipt.create({
            userId: req.user.id,
            storage: "s3",
            bucket: s3Info.bucket,
            s3Key: s3Info.key,
            url: s3Info.url || null,
            originalName: req.file.originalname,
            contentType: "image/jpeg",
            size: normalized.length,
            etag: s3Info.etag || null,
            status: "processing",
            model: modelName,
        });

        // Gemini parse
        const aiClient = new GoogleGenAI({ apiKey: apiKeyToUse });
        const prompt = buildPrompt();

        const startTime = Date.now();
        const base64 = normalized.toString("base64");

        const result = await aiClient.models.generateContent({
            model: modelName,
            temperature: 0,
            maxOutputTokens: 1500,
            contents: [
                {
                    role: "user",
                    parts: [
                        { text: prompt },
                        { inlineData: { mimeType: "image/jpeg", data: base64 } },
                    ],
                },
            ],
        });

        const endTime = Date.now();
        const responseText = result?.response?.text?.() || result?.text || "";
        const parsed = tryParseJsonFromText(responseText);

        // Cost estimate
        const promptTokens = Math.round(prompt.length / 4);
        const outputTokens = Math.round(responseText.length / 4);
        const estimatedCost = estimateGeminiCost(promptTokens, outputTokens, modelName);

        // Update receipt with result
        receipt.status = "done";
        receipt.parsed = parsed;
        if (parsed && typeof parsed === "object" && parsed.rawText) {
            receipt.rawText = parsed.rawText;
        }
        await receipt.save();

        return res.json({
            success: true,
            receiptId: receipt._id,
            file: {
                bucket: receipt.bucket,
                key: receipt.s3Key,
                url: receipt.url,            // null if private/no CDN base
                contentType: receipt.contentType,
                size: receipt.size,
            },
            parsed,
            model: modelName,
            token_estimate: { promptTokens, outputTokens },
            estimated_cost_usd: estimatedCost,
            processing_ms: endTime - startTime,
            paid_user: isPaid,
        });
    } catch (err) {
        console.error("Receipt upload/parse error:", err);

        if (receipt) {
            try {
                receipt.status = "failed";
                receipt.error = err?.message || String(err);
                await receipt.save();
            } catch (e2) {
                console.error("Failed to update receipt status:", e2);
            }
        }

        return res.status(500).json({ error: "server_error", message: err.message });
    }
});


router.get("/:id/signed-url", auth, async (req, res) => {
  try {
    const receiptId = req.params.id;
    if (!receiptId) return res.status(400).json({ error: "missing_id", message: "receipt id required" });

    // fetch receipt record
    const receipt = await Receipt.findById(receiptId).lean();
    if (!receipt) return res.status(404).json({ error: "not_found", message: "Receipt not found" });

    // bucket/key resolution
    const Bucket = receipt.bucket || process.env.DEFAULT_BUCKET;
    const Key = receipt.s3Key || receipt.key || receipt.path;
    if (!Bucket || !Key) return res.status(400).json({ error: "missing_storage_info", message: "Receipt missing bucket or key" });

    // build command and generate signed url (expires in seconds)
    const cmd = new GetObjectCommand({ Bucket, Key });
    const expiresIn = Number(process.env.RECEIPT_SIGNED_URL_EXPIRES_IN) || 300; // default 5 minutes
    const url = await getSignedUrl(s3, cmd, { expiresIn });

    // optionally log minimal info but avoid leaking secrets
    console.log(`[signed-url] generated for receipt ${receiptId} (expires ${expiresIn}s)`);
    console.log(url);
    
    return res.json({ url });
  } catch (err) {
    console.error("signed-url error:", err);
    // don't leak AWS errors to client; return generic message
    return res.status(500).json({ error: "server_error", message: "Failed to generate signed URL" });
  }
});


module.exports = router;
