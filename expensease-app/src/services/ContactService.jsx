// src/services/ContactService.js
import * as Contacts from "expo-contacts";
import { parsePhoneNumberFromString } from "libphonenumber-js/mobile";
import sha256 from "crypto-js/sha256";
import Hex from "crypto-js/enc-hex";
import Constants from "expo-constants";
import * as Localization from "expo-localization";
import { api } from "../utils/api";

const BASE = "/v1/contacts";

// SALT from expo extra or env
const SALT = process.env.EXPO_PUBLIC_CONTACT_HASH_KEY

if (!SALT) {
    console.warn(
        "CONTACT_HASH_KEY is not set. Hashing will be weaker (dev only)."
    );
}

/* ---------------- Helpers ---------------- */
const normalizeEmail = (email) =>
    email ? String(email).trim().toLowerCase() : null;

/**
 * Try to detect a country (ISO 2-letter like 'IN' or 'US') from a full phone string.
 * Returns uppercase country or null.
 */
const detectCountryFromPhone = (phone) => {
    if (!phone) return null;
    try {
        const pn = parsePhoneNumberFromString(String(phone));
        if (pn && typeof pn.country === "string" && pn.country.length === 2) {
            return pn.country.toUpperCase();
        }
    } catch (e) {
        // ignore
    }
    return null;
};

/**
 * Normalize phone with fallback order:
 * 1) If raw starts with '+' -> parse and trust
 * 2) If contactCountry provided -> parse using contactCountry
 * 3) Else use userCountry (derived from userPhone or passed default)
 * 4) Finally fallback to +<digits> if >=8 digits
 *
 * Returns { e164: string|null, usedStrategy: string|null }
 */
const normalizePhone = (raw, userCountry = "IN", contactCountry = null) => {
    if (!raw) return { e164: null, usedStrategy: null };

    const s = String(raw).trim();

    // 1) If starts with +, trust it first
    if (/^\+/.test(s)) {
        try {
            const pn = parsePhoneNumberFromString(s); // E.164 input doesn't need region
            if (pn && pn.isValid && pn.isValid()) {
                return { e164: pn.number, usedStrategy: "e164" };
            }
        } catch (e) {
            // fall through
        }
    }

    const tryRegion = (region) => {
        if (!region) return null;
        try {
            const pn = parsePhoneNumberFromString(s, region);
            if (pn && pn.isValid && pn.isValid()) return pn.number;
        } catch (e) {
            // ignore
        }
        return null;
    };

    if (userCountry) {
        const uc = tryRegion(userCountry);
        if (uc) return { e164: uc, usedStrategy: "userCountry" };
    }

    // 2) contactCountry if provided (try it first as you prefer contact metadata when present)
    if (contactCountry) {
        const cc = tryRegion(contactCountry);
        if (cc) return { e164: cc, usedStrategy: "contactCountry" };
    }
    // helper to try parsing with a region

    // 3) userCountry fallback


    // 4) device locale fallback (if different and available)
    try {
        const deviceRegion = (Localization.country || "").toUpperCase();
        if (deviceRegion && deviceRegion !== (userCountry || "").toUpperCase()) {
            const dp = tryRegion(deviceRegion);
            if (dp) return { e164: dp, usedStrategy: "deviceCountry" };
        }
    } catch (e) {
        // ignore
    }

    // 5) last fallback: prefix +digits if reasonably long
    const digits = s.replace(/\D+/g, "");
    if (digits.length >= 8) {
        return { e164: `+${digits}`, usedStrategy: "fallback-digits" };
    }

    return { e164: null, usedStrategy: null };
};

const hashValue = (val) => {
    if (!val) return null;
    return Hex.stringify(sha256(SALT + val));
};

/* ---------------- Permissions ---------------- */
export async function requestContactsPermission() {
    const { status, granted } = await Contacts.requestPermissionsAsync();
    return status === "granted" || granted === true;
}

/* ---------------- Local Fetch & Hash ---------------- */
/**
 * fetchAndHashContacts({ userPhone, userCountry, maxContacts })
 *
 * - userPhone: optional E.164 phone of the signed-in user (e.g. "+919876543210")
 *              If provided, we'll try to derive userCountry from it.
 * - userCountry: fallback ISO country (e.g. "IN") used if userPhone not provided or not parseable.
 */
export async function fetchAndHashContacts({
    userPhone = null,
    userCountry = "IN",
    maxContacts = 1000,
} = {}) {
    const perm = await requestContactsPermission();
    if (!perm) throw new Error("Contacts permission denied");

    // derive a reliable user country from userPhone if available
    const derivedFromUserPhone = detectCountryFromPhone(userPhone);
    const defaultUserCountry = derivedFromUserPhone || (userCountry ? String(userCountry).toUpperCase() : "IN");

    const { data } = await Contacts.getContactsAsync({
        fields: [Contacts.Fields.Emails, Contacts.Fields.PhoneNumbers, Contacts.Fields.Name],
        pageSize: 1000,
    });

    let results = [];
    let skipped = 0;

    for (let i = 0; i < data.length && results.length < maxContacts; i++) {
        const contact = data[i];
        const name = contact.name || "";

        // read contact-specified country if present (expo contact shapes vary)
        const contactCountry =
            (contact.isoCountryCode || contact.countryCode || contact.country || "")
                .toString()
                .trim()
                .toUpperCase() || null;

        if (contact.phoneNumbers) {
            for (const p of contact.phoneNumbers) {
                // Normalize using contactCountry if available; otherwise defaultUserCountry
                const { e164, usedStrategy } = normalizePhone(p.number, defaultUserCountry, contactCountry);
                if (!e164) {
                    skipped++;
                    continue;
                }

                const hash = hashValue(e164);
                if (!hash) {
                    skipped++;
                    continue;
                }

                // dev-only extras (do not log/send rawValue to telemetry)
                results.push({
                    contactHash: hash,
                    type: "phone",
                    label: p.label || "",
                    name,
                    rawValue: e164, // dev-only: remove/ignore in production
                    usedStrategy,
                });
            }
        }

        if (contact.emails) {
            for (const e of contact.emails) {
                const normalized = normalizeEmail(e.email);
                if (!normalized) {
                    skipped++;
                    continue;
                }
                const hash = hashValue(normalized);
                if (!hash) {
                    skipped++;
                    continue;
                }
                results.push({
                    contactHash: hash,
                    type: "email",
                    label: e.label || "",
                    name,
                    rawValue: normalized, // dev-only
                    usedStrategy: "email",
                });
            }
        }
    }

    // dedupe by contactHash
    const seen = new Set();
    const deduped = [];
    for (const r of results) {
        if (!seen.has(r.contactHash)) {
            seen.add(r.contactHash);
            deduped.push(r);
        }
    }

    return { hashes: deduped, skippedCount: skipped };
}

/* ---------------- API Calls ---------------- */


/**
 * Upload contact hashes in batches of 500.
 *
 * @param {Array<string>} hashes - array of contactHash strings OR objects { contactHash, type }
 * @param {Object} opts
 *   - batchSize (default 500)
 *   - concurrency (default 1) - how many requests to run in parallel
 *   - maxRetries (default 2)
 *   - retryBaseMs (default 300)
 *
 * Returns aggregated result:
 * {
 *   uploaded: number,            // sum of uploaded values from backend responses (best-effort)
 *   matches: [ { contactHash, type, matchedUsers: [...] }, ... ]  // aggregated (unique by contactHash)
 *   matchedUsers: [ ... ]       // aggregated unique matched users
 *   summary: { totalReceived, totalUnique, matchedCount }
 *   errors: [ { batchIndex, error } ]
 * }
 */
export async function uploadContactHashesBatched(hashes = [], opts = {}) {
  const batchSize = Number(opts.batchSize || 500);
  const concurrency = Number(opts.concurrency || 1);
  const MAX_RETRIES = Number(opts.maxRetries ?? 2);
  const RETRY_BASE_MS = Number(opts.retryBaseMs ?? 300);

  // Normalize incoming items to objects { contactHash, type }
  const normalize = (h) => {
    if (!h) return null;
    if (typeof h === 'string') return { contactHash: String(h).trim(), type: 'phone' }; // default type if unknown
    if (typeof h === 'object') {
      const ch = h.contactHash || h.hash || h.key || '';
      const type = (h.type || h.t || '').toString().toLowerCase() || 'phone';
      return { contactHash: String(ch).trim(), type };
    }
    return null;
  };

  const normalized = hashes.map(normalize).filter(Boolean);

  // dedupe by contactHash
  const uniqMap = new Map();
  for (const it of normalized) {
    if (!it.contactHash) continue;
    if (!uniqMap.has(it.contactHash)) uniqMap.set(it.contactHash, it);
  }
  const uniq = Array.from(uniqMap.values());

  // chunk helper
  const chunkArray = (arr, size) => {
    const out = [];
    for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
    return out;
  };

  const batches = chunkArray(uniq, batchSize);

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  const aggregatedMatchesMap = new Map();
  const aggregatedUsersMap = new Map();
  let totalUploaded = 0;
  const errors = [];

  // sequential worker queue (concurrency control)
  let idx = 0;
  const runWorker = async () => {
    while (true) {
      const i = idx++;
      if (i >= batches.length) return;
      const batch = batches[i];
      let attempt = 0;
      while (attempt <= MAX_RETRIES) {
        try {
          const payload = { contacts: batch.map((b) => ({ contactHash: b.contactHash, type: b.type })) };
          // adapt path if your api base differs
          const resp = await api.post('/v1/contacts/upload', payload);
          const data = resp && resp.data ? resp.data : resp;

          // aggregate uploaded
          if (Number.isFinite(data?.uploaded)) totalUploaded += Number(data.uploaded);
          else totalUploaded += batch.length; // best-effort fall back

          // aggregate matches array (per contactHash)
          if (Array.isArray(data?.matches)) {
            for (const m of data.matches) {
              const key = String(m.contactHash);
              const existing = aggregatedMatchesMap.get(key) || { contactHash: key, type: m.type || null, matchedUsers: [] };
              // merge matchedUsers (avoid dup by _id or email/phone)
              const seen = new Set(existing.matchedUsers.map((u) => String(u._id || u.email || u.phone)));
              for (const mu of (m.matchedUsers || [])) {
                const mk = String(mu._id || mu.email || mu.phone || JSON.stringify(mu));
                if (!seen.has(mk)) {
                  existing.matchedUsers.push(mu);
                  seen.add(mk);
                }
                // also aggregate into aggregatedUsersMap
                const userKey = String(mu._id || mu.email || mu.phone || mk);
                if (!aggregatedUsersMap.has(userKey)) aggregatedUsersMap.set(userKey, mu);
              }
              aggregatedMatchesMap.set(key, existing);
            }
          }

          // aggregate matchedUsers top-level if returned
          if (Array.isArray(data?.matchedUsers)) {
            for (const mu of data.matchedUsers) {
              const userKey = String(mu._id || mu.email || mu.phone || JSON.stringify(mu));
              if (!aggregatedUsersMap.has(userKey)) aggregatedUsersMap.set(userKey, mu);
            }
          }

          break; // success -> break retry loop
        } catch (err) {
          attempt += 1;
          const shouldRetry = attempt <= MAX_RETRIES;
          if (!shouldRetry) {
            errors.push({ batchIndex: i, error: String(err?.message || err) });
            break;
          }
          const backoff = RETRY_BASE_MS * Math.pow(2, attempt - 1);
          await sleep(backoff + Math.random() * 100);
        }
      }
    }
  };

  // start N workers
  const workers = Array.from({ length: Math.max(1, Math.min(concurrency, batches.length)) }, () => runWorker());
  await Promise.all(workers);

  // prepare aggregated response
  const matches = Array.from(aggregatedMatchesMap.values());
  const matchedUsers = Array.from(aggregatedUsersMap.values());

  return {
    uploaded: totalUploaded,
    matches,
    matchedUsers,
    summary: {
      totalReceived: hashes.length,
      totalUnique: uniq.length,
      matchedCount: matchedUsers.length,
      batches: batches.length,
    },
    errors,
  };
}

// Get uploaded contacts (paginated)
export const listUploadedContacts = ({ limit = 50, skip = 0 } = {}) =>
    api.get(`${BASE}?limit=${limit}&skip=${skip}`);

// Delete all contacts
export const deleteAllContacts = () => api.delete(`${BASE}`);

// Delete one contact by hash
export const deleteContact = (contactHash) =>
    api.delete(`${BASE}/${encodeURIComponent(contactHash)}`);
