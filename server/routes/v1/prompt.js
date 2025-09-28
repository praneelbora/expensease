// utils/prompts/voicePromptUnified.js
module.exports = function buildUnifiedVoicePrompt(rawText, paymentAccounts = [], friends = [], groups = [], opts = {}) {
  // opts: { today: "YYYY-MM-DD" } optional
  const today = opts.today || new Date().toISOString().split("T")[0];

  const accountsJson = JSON.stringify(
    (paymentAccounts || []).map((a) => ({
      _id: a._id,
      label: a.label,
      type: a.type,
      isDefaultSend: !!a.isDefaultSend,
      isDefaultReceive: !!a.isDefaultReceive,
    })),
    null,
    2
  );

  const friendsJson = JSON.stringify(
    (friends || []).map((f) => ({
      _id: f._id,
      name: f.name,
      emails: f.emails || [],
      phones: f.phones || [],
      nicknames: f.nicknames || [],
    })),
    null,
    2
  );

  const groupsJson = JSON.stringify(
    (groups || []).map((g) => ({
      _id: g._id,
      name: g.name,
      memberNames: (g.members || []).map((m) => m.name),
    })),
    null,
    2
  );

  return `
You are a STRICT JSON-only extractor. Produce EXACTLY one JSON object (no explanation, no markdown, no code fences).

Task:
- Read the transcript below and decide whether it describes a PERSONAL expense (single-payer, no split) or a SPLIT expense (multiple participants, shared amounts).
- Output a single JSON object with the schema described below. Use null for unknown values. Use true/false for booleans. Use numbers for numeric values. Do not add extra keys.

TOP-LEVEL JSON SCHEMA:
{
  "mode": "personal" | "split" | "unsure",
  "amount": number | null,
  "currency": string | null,       // 3-letter ISO or null
  "date": string | null,           // ISO YYYY-MM-DD or null (see rules)
  "description": string | null,
  "category": string | null,       // one of allowed categories or null
  "paymentMethod": string | null,  // account _id from accounts list if applicable, else null
  "participants": [                // for personal: include payer (Me) item; for split: list of all mentioned participants (include Me)
    {
      "name": string,
      "matchedFriendId": string | null,
      "paying": boolean,
      "owing": boolean,
      "payAmount": number | null,
      "oweAmount": number | null,
      "owePercent": number | null,
      "paymentMethod": string | null
    }
  ] | null,
  "splitMode": "equal" | "value" | "percent" | "unspecified",
  "groupMention": { "groupId": string | null, "groupName": string | null } | null,
  "confidence": number,            // 0.0 - 1.0
  "notes": string | null,
  "raw_transcript": string
}

ALLOWED CATEGORIES (exact strings; return null if unsure):
Default, Education, Donate, Electronics, Entertainment, Food & Drinks, Games, Gift, Groceries, Heart, Health Care, Insurance, Investment, House, General, Office, Religion, Shopping, Sports, Subscriptions, Transport, Travel, Pets.

RULES (be conservative and deterministic):
1) Mode detection:
   - If transcript explicitly mentions splitting, sharing, "split", "each", "per head", "divide", "we split", multiple names or "A owes B" then prefer "split".
   - If transcript describes a single payment ("I paid", "charged me", "I bought") with no split references, prefer "personal".
   - If ambiguous, set mode = "unsure" and still populate best-effort fields.

2) Amount & currency:
   - Parse the total amount if present. Return as number rounded to two decimals.
   - Currency: 3-letter ISO (INR, USD, etc.) if mentioned; else null.
   - If no numeric amount found, set amount to null.

3) Date:
   - Today is ${today}.
   - "today" or no explicit date => null.
   - "yesterday" => ISO date of yesterday.
   - Spoken explicit dates should be converted to ISO YYYY-MM-DD where possible; else null.

4) Participants:
   - Include "Me" when user refers to self (I, me, we paid, I paid).
   - Try to extract named participants (Amit, Priya). For each:
       • Set matchedFriendId to a friend _id only if high-confidence match (do NOT invent ids).
       • Set paying=true if the transcript indicates that person paid.
       • Set owing=true if person owes part of the bill.
       • Fill payAmount/oweAmount/owePercent when the transcript gives values; else null.
   - If equal split implied and no per-person amounts given, set splitMode="equal" and leave individual oweAmount/owePercent null (app will compute).
   - Round numeric amounts to two decimals and percents to two decimals.

5) Split mode & arithmetic:
   - Determine splitMode: "equal"|"value"|"percent"|"unspecified".
   - If mode is "value" ensure per-person oweAmount sums to total amount; if inference cannot produce consistent sums, set per-person numeric fields to null and add a clarifying note.
   - If mode is "percent" ensure percents sum to ~100; else null those fields and note.

6) Payment method resolution:
   - Use provided accounts list (accounts JSON below).
   - Map terms: "gpay"/"phonepe"/"upi" → type "upi"; "cash" → type "cash"; "card"/"credit card"/"debit card" → type "card"; "bank"/"transfer" → type "bank".
   - If multiple candidate accounts match, choose isDefaultSend=true, else isDefaultReceive=true, else first match.
   - Do not invent account _ids.

7) Group mention:
   - If a group name is said, match to provided groups list; set groupId when confident, else set groupName if only the name is inferred.

8) Confidence:
   - Provide confidence between 0.0 and 1.0 expressing overall parsing reliability.
   - Lower confidence (<0.6) when participant matches are ambiguous, amounts missing, or sums inconsistent.

9) Conservative behavior:
   - When in doubt about numeric splits or friend matches, prefer null and add a short clarifying note.
   - Never output keys beyond the schema.

Available payment accounts:
${accountsJson}

Available friends (for name matching):
${friendsJson}

Available groups:
${groupsJson}

Transcript:
"""${rawText}"""

Return ONLY the JSON object described above.
`.trim();
};
