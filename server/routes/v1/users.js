const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();
const User = require('../../models/User');
const Group = require('../../models/Group');
const Expense = require('../../models/Expense');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const auth = require('../../middleware/auth');
const DefaultCategories = require('../../assets/Categories').default;
const { OAuth2Client } = require("google-auth-library");
const client = new OAuth2Client();
const https = require("https");
const JWT_SECRET = process.env.JWT_SECRET;
const PaymentMethod = require("../../models/PaymentMethod");
const PaymentMethodTxn = require("../../models/PaymentMethodTransaction");
const Admin = require('../../models/Admin');
const FriendRequest = require('../../models/FriendRequest');
const jwkToPem = require("jwk-to-pem");

const { savePushTokenPublic, savePushTokenAuthed, savePushToken } = require("./controller.js");

// --- DEV bypass config (place near other constants / requires) ---
const DEV_BYPASS_PHONES = new Set([
    "+911234567890", // your test number(s) in E.164
    // add more numbers here if needed
]);

const normalizePhone = (p) =>
    String(p || "")
        .replace(/[^\d+]/g, "")
        .replace(/^00/, "+")
        .replace(/^(?=\d{10,}$)/, "+") // if user passed raw 10+ digits, ensure a + is present? (optional)
        .trim();


// fetch compatibility (node18+ has global fetch). If not present, use node-fetch.
let fetchFn = global.fetch;
if (!fetchFn) {
    try {
        // eslint-disable-next-line global-require
        fetchFn = require("node-fetch");
    } catch (e) {
        // will fallback later to https-based implementation; but usually node-fetch is installed or Node >=18 used
        fetchFn = null;
    }
}

// Apple constants
const APPLE_JWKS_URL = "https://appleid.apple.com/auth/keys";
const APPLE_ISS = "https://appleid.apple.com";
const APPLE_AUD = process.env.APPLE_AUD || process.env.APPLE_CLIENT_ID || "com.";

/* JWKS cache */
let _appleJwksCache = null;
let _appleJwksFetchedAt = 0;

/* fetchJWKS using fetch (or fallback to https) */
async function fetchAppleJwks(force = false) {
    const now = Date.now();
    if (!force && _appleJwksCache && (now - _appleJwksFetchedAt) < 24 * 60 * 60 * 1000) {
        return _appleJwksCache;
    }

    // Prefer fetch
    if (fetchFn) {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 5000);
        try {
            const resp = await fetchFn(APPLE_JWKS_URL, { signal: controller.signal });
            clearTimeout(timeout);
            if (!resp.ok) throw new Error(`JWKS fetch failed: ${resp.status} ${resp.statusText}`);
            const data = await resp.json();
            if (!data || !Array.isArray(data.keys)) throw new Error("Invalid JWKS response");
            _appleJwksCache = data;
            _appleJwksFetchedAt = Date.now();
            return _appleJwksCache;
        } catch (err) {
            clearTimeout(timeout);
            // rethrow so caller can optionally retry with force=true
            throw err;
        }
    }

    // Fallback: use https.get
    return new Promise((resolve, reject) => {
        const req = https.get(APPLE_JWKS_URL, (res) => {
            const { statusCode } = res;
            const chunks = [];
            res.on("data", (c) => chunks.push(c));
            res.on("end", () => {
                const raw = Buffer.concat(chunks).toString();
                if (statusCode < 200 || statusCode >= 300) {
                    return reject(new Error(`JWKS HTTP ${statusCode}: ${raw}`));
                }
                try {
                    const parsed = JSON.parse(raw);
                    if (!parsed || !Array.isArray(parsed.keys)) return reject(new Error("Invalid JWKS JSON"));
                    _appleJwksCache = parsed;
                    _appleJwksFetchedAt = Date.now();
                    resolve(parsed);
                } catch (e) {
                    reject(e);
                }
            });
        });

        req.on("error", (err) => reject(err));
        req.setTimeout(5000, () => {
            req.abort();
            reject(new Error("JWKS request timed out"));
        });
    });
}

/* verifyAppleIdentityToken - verify signature + claims (iss, aud, exp) */
async function verifyAppleIdentityToken(idToken) {
    if (!idToken) throw new Error("No idToken provided");

    const decoded = jwt.decode(idToken, { complete: true });
    if (!decoded || !decoded.header) throw new Error("Invalid identity token (failed to decode header)");

    const { kid, alg } = decoded.header;
    if (!kid || !alg) throw new Error("Invalid token header (missing kid/alg)");

    // try to fetch cached jwks and find matching key
    let jwks = null;
    try {
        jwks = await fetchAppleJwks();
    } catch (e) {
        // If initial fetch fails, try one more time (short retry)
        try {
            jwks = await fetchAppleJwks(true);
        } catch (e2) {
            throw new Error("Failed to fetch Apple JWKS: " + (e2?.message || e?.message || e));
        }
    }

    if (!jwks || !Array.isArray(jwks.keys)) throw new Error("Apple JWKS fetch returned invalid keys");

    let jwk = jwks.keys.find((k) => k.kid === kid && k.alg === alg);
    if (!jwk) {
        // maybe rotated — refetch once and try again
        const jwks2 = await fetchAppleJwks(true);
        jwk = jwks2.keys.find((k) => k.kid === kid && k.alg === alg);
        if (!jwk) throw new Error("No matching JWK found for token kid/alg");
    }

    // convert JWK to PEM and verify
    const pem = jwkToPem(jwk);
    const verifyOptions = {
        algorithms: [alg],
        issuer: APPLE_ISS,
        audience: APPLE_AUD,
    };

    try {
        const payload = jwt.verify(idToken, pem, verifyOptions);
        return payload; // contains sub, email, email_verified, iat, exp, etc.
    } catch (err) {
        // provide clearer error to caller
        throw new Error("Apple identity token verification failed: " + (err?.message || err));
    }
}

/* Apple login route */
router.post("/apple-login", async (req, res) => {
    try {
        const { identity_token, identityToken, authorization_code, pushToken, platform, fullName } = req.body || {};
        const idToken = identity_token || identityToken;
        if (!idToken) return res.status(400).json({ error: "Missing identity token (identity_token)" });
        console.log(req.body);

        let payload;
        try {
            payload = await verifyAppleIdentityToken(idToken);
            console.log(payload);
        } catch (err) {
            console.error("apple-login: identityToken verification failed:", err?.message || err);
            return res.status(401).json({ error: "Invalid Apple identity token", detail: String(err?.message || err) });
        }

        const appleId = payload.sub;
        const email = payload.email || null;
        const emailVerified = (payload.email_verified === "true" || payload.email_verified === true || payload.email_verified === 1);

        // Get display name from client if provided (Apple only returns name first time)
        const nameFromClient = fullName || req.body?.full_name || null;
        let user = null;
        let newUser = false;

        // 1) Try to find by appleId first (preferred)
        if (appleId) {
            user = await User.findOne({ appleId }).exec();
        }

        // 2) If not found by appleId and we have email, fallback to matching either email OR appleEmail
        if (!user && email) {
            user = await User.findOne({ $or: [{ email }, { appleEmail: email }] }).exec();
        }

        // 3) Create user if still not found
        if (!user) {
            newUser = true;
            const newUserObj = {
                appleId: appleId || undefined,
                email: email || undefined,         // prefer to set email if Apple provided it
                appleEmail: email || undefined,    // also store appleEmail so we keep trace of source
                name: (nameFromClient && String(nameFromClient).trim()) || (payload.name || "") || "",
                createdAt: new Date(),
            };

            user = await User.create(newUserObj);

            // create default payment method
            await PaymentMethod.create({
                userId: user._id,
                label: "Cash",
                type: "cash",
                balances: { INR: { available: 0, pending: 0 } },
                capabilities: ["send", "receive"],
                isDefaultSend: true,
                isDefaultReceive: true,
                provider: "manual",
                status: "verified",
            });
        } else {
            // If we found a user by email/appleEmail but appleId is not attached, attach it
            if (appleId && !user.appleId) {
                try {
                    user.appleId = appleId;
                    // If the user previously had no appleEmail but Apple provided one, set it
                    if (email && !user.appleEmail) user.appleEmail = email;
                    await user.save();
                } catch (e) {
                    console.warn("apple-login: failed to attach appleId to existing user:", e?.message || e);
                }
            }

            // If the user has no email but Apple provided one, consider updating email (optionally)
            // NOTE: be careful with conflicts here if you have unique index on email.
            if (email && !user.email) {
                try {
                    // Only set user.email if it's safe (no other account uses that email).
                    const conflict = await User.findOne({ email }).select("_id").lean();
                    if (!conflict) {
                        user.email = email;
                        // Also set appleEmail for traceability
                        if (!user.appleEmail) user.appleEmail = email;
                        await user.save();
                    } else if (String(conflict._id) === String(user._id)) {
                        // same user, safe to set
                        user.email = email;
                        if (!user.appleEmail) user.appleEmail = email;
                        await user.save();
                    } else {
                        // conflict exists on a different account — skip auto-setting and log
                        console.warn("apple-login: email from Apple conflicts with another account, skipping email attach.");
                    }
                } catch (e) {
                    console.warn("apple-login: setting email from Apple failed:", e?.message || e);
                }
            }
        }

        // Save push token if provided (your savePushToken implementation)
        if (pushToken) {
            try {
                await savePushToken({ userId: user._id, token: pushToken, platform });
            } catch (e) {
                console.warn("apple-login: saving push token failed:", e?.message || e);
            }
        }

        // Issue JWT
        const authToken = jwt.sign({ id: user._id }, JWT_SECRET, { expiresIn: "100d" });

        // Return user with a sane email field (prefer user.email, fallback to user.appleEmail)
        const returnedEmail = user.email || user.appleEmail || null;

        return res.status(200).json({
            responseBody: { "x-auth-token": authToken },
            user: { id: user._id, name: user.name, email: returnedEmail, picture: user.picture },
            newUser,
        });
    } catch (err) {
        console.error("apple-login unexpected error:", err?.stack || err);
        return res.status(500).json({ error: "Apple login failed", detail: String(err?.message || err) });
    }
});


// // 👤 Authenticated User Info
router.get('/', auth, async (req, res) => {
    try {
        const user = await User.findById(req.user.id)
        res.json(user);
    } catch (error) {
        console.error('/ GET user error:', error);
        res.status(500).json({ error: 'Failed to fetch user' });
    }
});

// // 🔁 Ping
router.get('/ping', (req, res) => {
    console.log('ping');
    res.send('🚀 Server is running!');
});

// GET Categories
router.get('/categories', auth, async (req, res) => {
    try {
        let user = await User.findById(req.user.id); // assume middleware added `req.user`
        if (!user) return res.status(401).json({ error: 'Unauthorized' });
        if (!user.customCategories || user.customCategories.length === 0) {
            user.customCategories = DefaultCategories
            await user.save();
            return res.json(user.customCategories);
        }

        res.json(user.customCategories);
    } catch (err) {
        console.error('Error getting categories:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

// POST Categories
router.post('/categories', auth, async (req, res) => {
    try {
        const user = await User.findById(req.user.id);
        const { categories } = req.body;

        if (!Array.isArray(categories)) {
            return res.status(400).json({ error: 'Invalid categories' });
        }

        user.customCategories = categories;
        await user.save();
        res.json({ success: true });
    } catch (err) {
        console.error('Error saving categories:', err);
        res.status(500).json({ error: 'Server error' });
    }
});


router.post("/google-login", async (req, res) => {
    console.log("Google login body:", req.body);
    const { id_token, access_token, pushToken, platform } = req.body;

    if (!id_token && !access_token) {
        return res.status(400).json({ error: "Missing id_token or access_token" });
    }

    try {
        let profile;

        if (id_token) {
            // Mobile flow (id_token)
            const ticket = await client.verifyIdToken({
                idToken: id_token,
                audience: [
                    process.env.GOOGLE_WEB_CLIENT_ID,
                    process.env.GOOGLE_ANDROID_CLIENT_ID,
                    process.env.GOOGLE_IOS_CLIENT_ID,
                ],
            });

            const payload = ticket.getPayload();
            console.log("Google payload:", payload);

            profile = {
                email: payload.email,
                name: payload.name,
                picture: payload.picture,
                googleId: payload.sub,
            };
        } else if (access_token) {
            // Web flow (access_token)
            const response = await fetch(
                `https://www.googleapis.com/oauth2/v3/userinfo?access_token=${access_token}`
            );
            const data = await response.json();
            profile = {
                email: data.email,
                name: data.name,
                picture: data.picture,
                googleId: data.sub,
            };
        }

        // --- Create or fetch user ---
        let user = await User.findOne({ email: profile.email });
        let newUser = false;

        if (!user) {
            newUser = true;
            user = await User.create(profile);

            await PaymentMethod.create({
                userId: user._id,
                label: "Cash",
                type: "cash",
                balances: { INR: { available: 0, pending: 0 } },
                capabilities: ["send", "receive"],
                isDefaultSend: true,
                isDefaultReceive: true,
                provider: "manual",
                status: "verified",
            });
        }

        // Save push token if provided
        if (pushToken) {
            await savePushToken({ userId: user._id, token: pushToken, platform });
        }

        // --- Issue JWT ---
        const authToken = jwt.sign({ id: user._id }, JWT_SECRET, { expiresIn: "100d" });

        res.status(200).json({
            responseBody: { "x-auth-token": authToken },
            user: { id: user._id, name: user.name, email: user.email, picture: user.picture },
            newUser,
        });
    } catch (err) {
        console.error("Google login failed:", err);
        res.status(401).json({ error: "Invalid or expired Google token" });
    }
});


router.patch('/profile', auth, async (req, res) => {
    const start = Date.now();
    const routeTag = '[PATCH /v1/users/profile]';
    try {
        const {
            name,
            profilePic,
            upiId: rawUpiId,
            vpa: rawVpa,
            defaultCurrency,
            preferredCurrencies,
            // new fields
            notificationPreferences,
            groupNotificationOverrides,
            friendNotificationOverrides,
            pushTokens, // optional: allow client to send token arrays (ios/android)
            avatarId,
        } = req.body || {};

        console.log(new Date().toISOString(), 'INFO', routeTag, 'incoming body:', req.body);

        const update = {};
        // ---------- Basic fields ----------
        console.debug(new Date().toISOString(), 'DEBUG', routeTag, 'validating basic fields');
        if (typeof name === 'string') {
            update.name = name.trim();
            console.debug(new Date().toISOString(), 'DEBUG', routeTag, 'will update name');
        }
        if (typeof profilePic === 'string') {
            update.profilePic = profilePic.trim();
            console.debug(new Date().toISOString(), 'DEBUG', routeTag, 'will update profilePic');
        }

        // ---------- UPI ----------
        const resolvedUpi = [rawUpiId, rawVpa].find(
            (v) => typeof v === 'string' && v.trim().length
        );
        const upiRegex = /^[a-zA-Z0-9.\-_]{2,}@[a-zA-Z0-9.\-]{2,}$/;
        if (resolvedUpi !== undefined) {
            const v = String(resolvedUpi).trim();
            console.debug(new Date().toISOString(), 'DEBUG', routeTag, 'validating upiId:', v);
            if (!upiRegex.test(v)) {
                console.warn(new Date().toISOString(), 'WARN', routeTag, 'validation failed: invalid upiId', v);
                return res.status(400).json({ error: 'Invalid UPI ID format (e.g., name@bank).' });
            }
            update.upiId = v;
            console.debug(new Date().toISOString(), 'DEBUG', routeTag, 'will update upiId');
        }

        // ---------- Currency ----------
        if (typeof defaultCurrency === 'string') {
            const cur = defaultCurrency.toUpperCase().trim();
            console.debug(new Date().toISOString(), 'DEBUG', routeTag, 'validating defaultCurrency:', cur);
            if (!/^[A-Z]{3}$/.test(cur)) {
                console.warn(new Date().toISOString(), 'WARN', routeTag, 'validation failed: defaultCurrency invalid', defaultCurrency);
                return res.status(400).json({ error: 'defaultCurrency must be a 3-letter ISO code (e.g., INR, USD).' });
            }
            update.defaultCurrency = cur;
            console.debug(new Date().toISOString(), 'DEBUG', routeTag, 'will update defaultCurrency:', cur);
        }

        if (Array.isArray(preferredCurrencies)) {
            console.debug(new Date().toISOString(), 'DEBUG', routeTag, 'validating preferredCurrencies array length=', preferredCurrencies.length);
            const cleaned = [...new Set(preferredCurrencies.map(c => String(c).toUpperCase().trim()))]
                .filter(c => /^[A-Z]{3}$/.test(c));
            update.preferredCurrencies = cleaned;
            console.debug(new Date().toISOString(), 'DEBUG', routeTag, 'will update preferredCurrencies:', cleaned);
        }
        // ---------- AvatarId (predefined avatars) ----------
        if (typeof avatarId !== 'undefined') {
            if (avatarId === null || avatarId === '') {
                // allow clearing avatar
                update.avatarId = null;
                console.debug(new Date().toISOString(), 'DEBUG', routeTag, 'will clear avatarId');
            } else if (typeof avatarId === 'string') {
                const a = avatarId.trim();
                console.debug(new Date().toISOString(), 'DEBUG', routeTag, 'validating avatarId:', a);


                update.avatarId = a;
                console.debug(new Date().toISOString(), 'DEBUG', routeTag, 'will update avatarId:', a);
            } else {
                console.warn(new Date().toISOString(), 'WARN', routeTag, 'validation failed: avatarId wrong type', typeof avatarId);
                return res.status(400).json({ error: 'avatarId must be a string or null' });
            }
        }


        // ---------- pushTokens (optional) ----------
        // Accept shape: { ios: [token], android: [token] } or arrays
        if (pushTokens) {
            console.debug(new Date().toISOString(), 'DEBUG', routeTag, 'processing pushTokens payload');
            const tokensUpdate = {};
            if (Array.isArray(pushTokens)) {
                // treat as android/ios unknown: push into android for now
                tokensUpdate['pushTokens.android'] = pushTokens.map(t => String(t)).filter(Boolean);
                console.debug(new Date().toISOString(), 'DEBUG', routeTag, 'received pushTokens array -> mapped to android count=', tokensUpdate['pushTokens.android'].length);
            } else if (typeof pushTokens === 'object') {
                if (Array.isArray(pushTokens.ios)) {
                    tokensUpdate['pushTokens.ios'] = pushTokens.ios.map(t => String(t)).filter(Boolean);
                    console.debug(new Date().toISOString(), 'DEBUG', routeTag, 'received pushTokens.ios count=', tokensUpdate['pushTokens.ios'].length);
                }
                if (Array.isArray(pushTokens.android)) {
                    tokensUpdate['pushTokens.android'] = pushTokens.android.map(t => String(t)).filter(Boolean);
                    console.debug(new Date().toISOString(), 'DEBUG', routeTag, 'received pushTokens.android count=', tokensUpdate['pushTokens.android'].length);
                }
            }
            // merge into update with $set
            if (Object.keys(tokensUpdate).length) {
                Object.assign(update, tokensUpdate);
            }
        }

        // ---------- Notification preferences ----------
        // Expected shape:
        // notificationPreferences: {
        //   push: { enabled: true/false, categories: { key: true/false }, mutedUntil: ISOString|null },
        //   email: { enabled, categories: {...} },
        //   inapp: { enabled, categories: {...} }
        // }
        if (notificationPreferences && typeof notificationPreferences === 'object') {
            console.debug(new Date().toISOString(), 'DEBUG', routeTag, 'validating notificationPreferences');
            const allowedChannels = ['push', 'email', 'inapp'];
            const npNext = {};

            for (const ch of allowedChannels) {
                const chObj = notificationPreferences[ch];
                if (!chObj) continue;

                const chNext = {};

                if (typeof chObj.enabled === 'boolean') {
                    chNext.enabled = chObj.enabled;
                    console.debug(new Date().toISOString(), 'DEBUG', routeTag, `notificationPreferences.${ch}.enabled =`, chNext.enabled);
                }

                // categories: accept plain object or map-like
                if (chObj.categories && typeof chObj.categories === 'object') {
                    const cats = {};
                    // if it's a Mongoose map-like (sent from client rarely), accept entries
                    if (typeof chObj.categories.entries === 'function') {
                        for (const [k, v] of chObj.categories.entries()) {
                            cats[String(k)] = !!v;
                        }
                    } else {
                        for (const [k, v] of Object.entries(chObj.categories)) {
                            cats[String(k)] = !!v;
                        }
                    }
                    chNext.categories = cats;
                    console.debug(new Date().toISOString(), 'DEBUG', routeTag, `notificationPreferences.${ch}.categories keys=`, Object.keys(cats));
                }

                // mutedUntil: accept ISO strings or null
                if (ch === 'push' && chObj.mutedUntil !== undefined) {
                    if (chObj.mutedUntil === null || chObj.mutedUntil === '') {
                        chNext.mutedUntil = null;
                        console.debug(new Date().toISOString(), 'DEBUG', routeTag, 'notificationPreferences.push.mutedUntil = null');
                    } else {
                        const d = new Date(chObj.mutedUntil);
                        if (Number.isNaN(d.getTime())) {
                            console.warn(new Date().toISOString(), 'WARN', routeTag, 'validation failed: push.mutedUntil invalid', chObj.mutedUntil);
                            return res.status(400).json({ error: 'push.mutedUntil must be a valid ISO date or null' });
                        }
                        chNext.mutedUntil = d;
                        console.debug(new Date().toISOString(), 'DEBUG', routeTag, 'notificationPreferences.push.mutedUntil parsed ->', d.toISOString());
                    }
                }

                npNext[ch] = chNext;
            }

            // Only set if we have at least one channel
            if (Object.keys(npNext).length) {
                update.notificationPreferences = npNext;
                console.debug(new Date().toISOString(), 'DEBUG', routeTag, 'will update notificationPreferences keys=', Object.keys(npNext));
            }
        }

        // ---------- Group overrides ----------
        // Expected shape: [{ groupId, push: {enabled,categories,mutedUntil}, email:{}, inapp:{} }, ...]
        if (Array.isArray(groupNotificationOverrides)) {
            console.debug(new Date().toISOString(), 'DEBUG', routeTag, 'validating groupNotificationOverrides count=', groupNotificationOverrides.length);
            const arr = [];
            for (const item of groupNotificationOverrides) {
                if (!item || !item.groupId) {
                    console.warn(new Date().toISOString(), 'WARN', routeTag, 'skipping invalid groupNotificationOverrides item', item);
                    continue;
                }
                const el = { groupId: item.groupId };

                // validate each channel if provided
                ['push', 'email', 'inapp'].forEach(ch => {
                    if (!item[ch]) return;
                    const chObj = item[ch];
                    const chNext = {};
                    if (typeof chObj.enabled === 'boolean') chNext.enabled = chObj.enabled;
                    if (chObj.categories && typeof chObj.categories === 'object') {
                        const cats = {};
                        if (typeof chObj.categories.entries === 'function') {
                            for (const [k, v] of chObj.categories.entries()) cats[String(k)] = !!v;
                        } else {
                            for (const [k, v] of Object.entries(chObj.categories)) cats[String(k)] = !!v;
                        }
                        chNext.categories = cats;
                    }
                    if (ch === 'push' && chObj.mutedUntil !== undefined) {
                        if (chObj.mutedUntil === null || chObj.mutedUntil === '') chNext.mutedUntil = null;
                        else {
                            const d = new Date(chObj.mutedUntil);
                            if (Number.isNaN(d.getTime())) {
                                console.warn(new Date().toISOString(), 'WARN', routeTag, 'validation failed: groupNotificationOverrides[*].push.mutedUntil invalid', chObj.mutedUntil);
                                return res.status(400).json({ error: 'groupNotificationOverrides[*].push.mutedUntil must be ISO date or null' });
                            }
                            chNext.mutedUntil = d;
                        }
                    }
                    el[ch] = chNext;
                });

                arr.push(el);
            }
            if (arr.length) {
                update.groupNotificationOverrides = arr;
                console.debug(new Date().toISOString(), 'DEBUG', routeTag, 'will update groupNotificationOverrides count=', arr.length);
            }
        }

        // ---------- Friend overrides ----------
        // Expected shape: [{ friendId, push: {enabled,categories,mutedUntil}, ... }, ...]
        if (Array.isArray(friendNotificationOverrides)) {
            console.debug(new Date().toISOString(), 'DEBUG', routeTag, 'validating friendNotificationOverrides count=', friendNotificationOverrides.length);
            const arr = [];
            for (const item of friendNotificationOverrides) {
                if (!item || !item.friendId) {
                    console.warn(new Date().toISOString(), 'WARN', routeTag, 'skipping invalid friendNotificationOverrides item', item);
                    continue;
                }
                const el = { friendId: item.friendId };

                ['push', 'email', 'inapp'].forEach(ch => {
                    if (!item[ch]) return;
                    const chObj = item[ch];
                    const chNext = {};
                    if (typeof chObj.enabled === 'boolean') chNext.enabled = chObj.enabled;
                    if (chObj.categories && typeof chObj.categories === 'object') {
                        const cats = {};
                        if (typeof chObj.categories.entries === 'function') {
                            for (const [k, v] of chObj.categories.entries()) cats[String(k)] = !!v;
                        } else {
                            for (const [k, v] of Object.entries(chObj.categories)) cats[String(k)] = !!v;
                        }
                        chNext.categories = cats;
                    }
                    if (ch === 'push' && chObj.mutedUntil !== undefined) {
                        if (chObj.mutedUntil === null || chObj.mutedUntil === '') chNext.mutedUntil = null;
                        else {
                            const d = new Date(chObj.mutedUntil);
                            if (Number.isNaN(d.getTime())) {
                                console.warn(new Date().toISOString(), 'WARN', routeTag, 'validation failed: friendNotificationOverrides[*].push.mutedUntil invalid', chObj.mutedUntil);
                                return res.status(400).json({ error: 'friendNotificationOverrides[*].push.mutedUntil must be ISO date or null' });
                            }
                            chNext.mutedUntil = d;
                        }
                    }
                    el[ch] = chNext;
                });

                arr.push(el);
            }
            if (arr.length) {
                update.friendNotificationOverrides = arr;
                console.debug(new Date().toISOString(), 'DEBUG', routeTag, 'will update friendNotificationOverrides count=', arr.length);
            }
        }

        // ---------- Nothing to update ----------
        if (!Object.keys(update).length) {
            console.debug(new Date().toISOString(), 'DEBUG', routeTag, 'prepared update is empty -> no changes');
            const existing = await User.findById(req.user.id).lean();
            console.log(new Date().toISOString(), 'INFO', routeTag, 'no-op response returned', { userId: req.user.id, durationMs: Date.now() - start });
            return res.status(200).json({ message: 'No changes', user: existing });
        }

        // ---------- Apply update ----------
        // Use $set for regular fields. For nested / date fields we already prepared values.
        const setObj = {};
        for (const [k, v] of Object.entries(update)) {
            setObj[k] = v;
        }
        console.debug(new Date().toISOString(), 'DEBUG', routeTag, 'prepared $set object keys=', Object.keys(setObj));

        let user;
        try {
            user = await User.findByIdAndUpdate(
                req.user.id,
                { $set: setObj },
                { new: true, runValidators: true, context: 'query' }
            ).lean();
        } catch (dbErr) {
            console.error(new Date().toISOString(), 'ERROR', routeTag, 'DB update failed:', dbErr);
            console.log(new Date().toISOString(), 'INFO', routeTag, 'response', { status: 500, message: 'Failed to update profile', durationMs: Date.now() - start });
            return res.status(500).json({ error: 'Failed to update profile' });
        }

        if (!user) {
            console.warn(new Date().toISOString(), 'WARN', routeTag, 'user not found for id', req.user.id);
            return res.status(404).json({ error: 'User not found' });
        }

        console.log(new Date().toISOString(), 'INFO', routeTag, 'db update result: userId=' + user._id + ', updatedFields=' + Object.keys(update).join(','));
        console.log(new Date().toISOString(), 'INFO', routeTag, 'response', { status: 200, durationMs: Date.now() - start });

        // Build response (avoid exposing sensitive arrays like raw push token internals if you prefer)
        return res.json({
            user: {
                id: user._id,
                name: user.name,
                email: user.email,
                profilePic: user.profilePic,
                upiId: user.upiId || null,
                defaultCurrency: user.defaultCurrency || 'INR',
                preferredCurrencies: user.preferredCurrencies || ['INR'],
                customCategories: user.customCategories || [],
                notificationPreferences: user.notificationPreferences || {},
                groupNotificationOverrides: user.groupNotificationOverrides || [],
                friendNotificationOverrides: user.friendNotificationOverrides || [],
                // Note: pushTokens included for convenience; remove if you wish not to send them back.
                pushTokens: user.pushTokens || { ios: [], android: [] },
            }
        });
    } catch (err) {
        console.error(new Date().toISOString(), 'ERROR', '[PATCH /v1/users/profile] unexpected error:', err);
        return res.status(500).json({ error: 'Failed to update profile' });
    }
});



router.delete('/me', auth, async (req, res) => {
    const session = await mongoose.startSession();
    try {
        const userId = req.user.id;

        await session.withTransaction(async () => {
            // 1) Collect this user's payment account IDs
            const pmIds = await PaymentMethod
                .find({ userId }, { _id: 1 })
                .session(session)
                .lean()
                .then(rows => rows.map(r => r._id));

            // 2) Delete PM transactions (journal)
            if (pmIds.length) {
                await PaymentMethodTxn.deleteMany(
                    { userId, paymentMethodId: { $in: pmIds } },
                    { session }
                );
            }

            // 3) Delete payment accounts
            await PaymentMethod.deleteMany({ userId }, { session });

            // 4) Delete expenses created by the user
            await Expense.deleteMany({ createdBy: userId }, { session });

            // 5) Remove the user from any splits in other peoples' expenses
            await Expense.updateMany(
                { 'splits.friendId': userId },
                { $pull: { splits: { friendId: userId } } },
                { session }
            );

            // 6) Remove the user from groups
            await Group.updateMany(
                { 'members._id': userId },
                { $pull: { members: { _id: userId } } },
                { session }
            );
            // (Optional) delete empty groups afterwards
            await Group.deleteMany({ members: { $size: 0 } }, { session });

            // 7) Delete friend requests involving this user (if model exists)
            if (FriendRequest) {
                await FriendRequest.deleteMany(
                    {
                        $or: [
                            { from: userId },
                            { to: userId },
                            // common alt field names:
                            { requester: userId },
                            { recipient: userId }
                        ]
                    },
                    { session }
                );
            }

            // 8) Finally, delete the user
            await User.deleteOne({ _id: userId }, { session });
        });

        res.status(204).send(); // no content
    } catch (err) {
        console.error('Delete user error:', err);
        res.status(500).json({ error: 'Failed to delete user' });
    } finally {
        session.endSession();
    }
});



const normalizeTopN = (topN) => Math.max(1, Math.min(50, Number(topN) || 5));

const toObjectId = (id) => {
    if (!id) return null;
    if (mongoose.isValidObjectId(id)) return new mongoose.Types.ObjectId(id);
    return null;
};

/**
 * Get friend suggestions for a user based on frequency + recency of shared expenses,
 * padded to return at least `topN` items when possible.
 */
const getFriendSuggestions = async (userId, topN = 5) => {
    topN = normalizeTopN(topN);

    const user = await User.findById(userId).select("friends").lean();
    const friendIds = Array.isArray(user?.friends) ? user.friends.filter(Boolean) : [];
    const friendObjectIds = friendIds
        .map((f) => toObjectId(f))
        .filter(Boolean);

    // weights (tweakable)
    const FREQ_WEIGHT = 0.7;
    const RECENCY_WEIGHT = 0.3;

    let results = [];
    if (friendObjectIds.length > 0) {
        results = await Expense.aggregate([
            {
                $match: {
                    $or: [
                        { createdBy: toObjectId(userId) },
                        { "splits.friendId": toObjectId(userId) }
                    ]
                }
            },
            { $unwind: "$splits" },
            {
                $match: {
                    "splits.friendId": { $in: friendObjectIds, $ne: toObjectId(userId) }
                }
            },
            {
                $group: {
                    _id: "$splits.friendId",
                    frequency: { $sum: 1 },
                    lastSeen: { $max: "$date" }
                }
            },
            {
                $addFields: {
                    daysAgo: { $divide: [{ $subtract: ["$$NOW", "$lastSeen"] }, 1000 * 60 * 60 * 24] }
                }
            },
            {
                $addFields: {
                    recencyWeight: {
                        $cond: [{ $lt: ["$daysAgo", 0] }, 1, { $divide: [1, { $add: ["$daysAgo", 1] }] }]
                    }
                }
            },
            {
                $addFields: {
                    score: {
                        $add: [
                            { $multiply: [FREQ_WEIGHT, "$frequency"] },
                            { $multiply: [RECENCY_WEIGHT, "$recencyWeight"] }
                        ]
                    }
                }
            },
            { $sort: { score: -1, frequency: -1, lastSeen: -1 } },
            { $limit: topN },
            {
                $lookup: {
                    from: "users",
                    localField: "_id",
                    foreignField: "_id",
                    as: "friend"
                }
            },
            { $unwind: "$friend" },
            {
                $project: {
                    _id: 0,
                    friendId: "$friend._id",
                    name: "$friend.name",
                    email: "$friend.email",
                    frequency: 1,
                    lastSeen: 1,
                    score: 1
                }
            }
        ]).exec();
    }

    // pad with other user friends
    const pickedIds = new Set(results.map(r => String(r.friendId)));
    if (results.length < topN && friendObjectIds.length > 0) {
        const deficit = topN - results.length;
        const remainingIds = friendObjectIds
            .map(String)
            .filter(id => !pickedIds.has(id))
            .slice(0, deficit)
            .map(id => toObjectId(id));

        if (remainingIds.length > 0) {
            const remainingFriends = await User.find(
                { _id: { $in: remainingIds } },
                { name: 1, email: 1 }
            )
                .limit(deficit)
                .lean();

            const padded = remainingFriends.map((f) => ({
                friendId: f._id,
                name: f.name,
                email: f.email,
                frequency: 0,
                lastSeen: null,
                score: 0
            }));
            padded.forEach(p => pickedIds.add(String(p.friendId)));
            results = results.concat(padded);
        }
    }

    // fallback to globally-popular users if still short
    if (results.length < topN) {
        const deficit = topN - results.length;
        const excludeIds = Array.from(pickedIds).concat([String(userId)]).filter(Boolean);
        const excludeObjectIds = excludeIds.map(id => toObjectId(id)).filter(Boolean);

        const popular = await Expense.aggregate([
            { $match: { createdBy: { $exists: true, $ne: null, $nin: excludeObjectIds } } },
            {
                $group: {
                    _id: "$createdBy",
                    frequency: { $sum: 1 },
                    lastSeen: { $max: "$date" }
                }
            },
            { $sort: { frequency: -1, lastSeen: -1 } },
            { $limit: deficit },
            {
                $lookup: {
                    from: "users",
                    localField: "_id",
                    foreignField: "_id",
                    as: "user"
                }
            },
            { $unwind: "$user" },
            {
                $project: {
                    _id: 0,
                    friendId: "$user._id",
                    name: "$user.name",
                    email: "$user.email",
                    frequency: 1,
                    lastSeen: 1,
                    score: "$frequency"
                }
            }
        ]).exec();

        results = results.concat(popular);
    }

    return results.slice(0, topN);
};


/**
 * Get group suggestions for a user padded to at least `topN`.
 */
const getGroupSuggestions = async (userId, topN = 5) => {
    topN = normalizeTopN(topN);

    const FREQ_WEIGHT = 0.75;
    const RECENCY_WEIGHT = 0.25;

    // 1) aggregation by groupId
    let results = await Expense.aggregate([
        {
            $match: {
                $or: [
                    { createdBy: toObjectId(userId) },
                    { "splits.friendId": toObjectId(userId) }
                ],
                groupId: { $exists: true, $ne: null }
            }
        },
        {
            $group: {
                _id: "$groupId",
                frequency: { $sum: 1 },
                lastSeen: { $max: "$date" }
            }
        },
        {
            $addFields: {
                daysAgo: { $divide: [{ $subtract: ["$$NOW", "$lastSeen"] }, 1000 * 60 * 60 * 24] }
            }
        },
        {
            $addFields: {
                recencyWeight: { $cond: [{ $lt: ["$daysAgo", 0] }, 1, { $divide: [1, { $add: ["$daysAgo", 1] }] }] }
            }
        },
        {
            $addFields: {
                score: {
                    $add: [
                        { $multiply: [FREQ_WEIGHT, "$frequency"] },
                        { $multiply: [RECENCY_WEIGHT, "$recencyWeight"] }
                    ]
                }
            }
        },
        { $sort: { score: -1, frequency: -1, lastSeen: -1 } },
        { $limit: topN },
        {
            $lookup: {
                from: "groups",
                localField: "_id",
                foreignField: "_id",
                as: "group"
            }
        },
        { $unwind: "$group" },
        {
            $project: {
                _id: 0,
                groupId: "$group._id",
                name: "$group.name",
                frequency: 1,
                lastSeen: 1,
                score: 1
            }
        }
    ]).exec();

    const pickedIds = new Set(results.map(r => String(r.groupId)));

    // 2) add user's groups (if user has them)
    if (results.length < topN) {
        const user = await User.findById(userId).select("groups").lean();
        const userGroupIds = Array.isArray(user?.groups) ? user.groups.filter(Boolean) : [];
        const remainingIds = userGroupIds.map(String).filter(id => !pickedIds.has(id)).slice(0, topN - results.length).map(toObjectId).filter(Boolean);

        if (remainingIds.length > 0) {
            const remaining = await Group.find({ _id: { $in: remainingIds } })
                .select("name")
                .limit(remainingIds.length)
                .lean();

            const padded = remaining.map(g => ({
                groupId: g._id,
                name: g.name,
                frequency: 0,
                lastSeen: null,
                score: 0
            }));
            padded.forEach(p => pickedIds.add(String(p.groupId)));
            results = results.concat(padded);
        }
    }

    // 3) fallback to globally popular groups
    if (results.length < topN) {
        const deficit = topN - results.length;
        const exclude = Array.from(pickedIds).map(id => toObjectId(id)).filter(Boolean);

        const popularGroups = await Expense.aggregate([
            { $match: { groupId: { $exists: true, $ne: null, $nin: exclude } } },
            {
                $group: {
                    _id: "$groupId",
                    frequency: { $sum: 1 },
                    lastSeen: { $max: "$date" }
                }
            },
            { $sort: { frequency: -1, lastSeen: -1 } },
            { $limit: deficit },
            {
                $lookup: {
                    from: "groups",
                    localField: "_id",
                    foreignField: "_id",
                    as: "group"
                }
            },
            { $unwind: "$group" },
            {
                $project: {
                    _id: 0,
                    groupId: "$group._id",
                    name: "$group.name",
                    frequency: 1,
                    lastSeen: 1,
                    score: "$frequency"
                }
            }
        ]).exec();

        results = results.concat(popularGroups);
    }

    return results.slice(0, topN);
};

// NEW route
router.get("/suggestions", auth, async (req, res) => {
    try {
        const [friends, groups] = await Promise.all([
            getFriendSuggestions(req.user.id),
            getGroupSuggestions(req.user.id)
        ]);

        res.json({ friends, groups });
    } catch (error) {
        console.error("suggestions/ error: ", error);
        res.status(500).json({ error: error.message });
    }
});

// POST /login
router.post("/login", async (req, res) => {
    const { email, password, pushToken, platform } = req.body;
    console.log("login body:", req.body);

    if (!email) return res.status(400).json({ error: "Missing email id" });

    // --- Single test-account enforcement ---
    const TEST_EMAIL = "mail.expensease@gmail.com";
    const TEST_PLAIN_PASSWORD = "expenseasetesting"; // consider moving to process.env.TEST_PW or hashing in DB

    try {
        // If it's the special test account, require the exact password
        if (email === TEST_EMAIL) {
            if (!password) return res.status(400).json({ error: "Missing password for test account" });

            // Plaintext check (simple). Replace with bcrypt.compare if you store a hash.
            if (password !== TEST_PLAIN_PASSWORD) {
                return res.status(401).json({ error: "Invalid email or password" });
            }

            // find or create user for the test account
            let user = await User.findOne({ email });
            let newUser = false;
            if (!user) {
                newUser = true;
                user = await User.create({ email, name: "TEST USER" });

                await PaymentMethod.create({
                    userId: user._id,
                    label: "Cash",
                    type: "cash",
                    supportedCurrencies: [],
                    balances: { INR: { available: 0, pending: 0 } },
                    capabilities: ["send", "receive"],
                    isDefaultSend: true,
                    isDefaultReceive: true,
                    provider: "manual",
                    status: "verified",
                });
            }

            if (pushToken) {
                await savePushToken({ userId: user._id, token: pushToken, platform });
            }

            const authToken = jwt.sign({ id: user._id }, JWT_SECRET, { expiresIn: "100d" });

            return res.status(200).json({
                responseBody: { "x-auth-token": authToken },
                user: { id: user._id, name: user.name, email: user.email, picture: user.picture },
                userId: user._id, // explicit userId field as requested
                newUser,
            });
        }

        // --- Non-test / developer flow (existing behavior) ---
        // allow only certain developer emails to use the dev auto-create flow
        const devEmails = [
            "praneelbora@gmail.com",
            "praneelbora9@gmail.com",
            "developerpraneel@gmail.com",
            "testlogin@expensease.in",
            "mail.expensease@gmail.com"
        ];

        if (!devEmails.includes(email)) {
            return res.status(403).json({ error: "Not a developer account" });
        }

        // For dev emails we keep the previous behavior: create user if not exists
        let user = await User.findOne({ email });
        let newUser = false;
        if (!user) {
            newUser = true;
            user = await User.create({ email, name: "TEST USER" });
            await PaymentMethod.create({
                userId: user._id,
                label: "Cash",
                type: "cash",
                supportedCurrencies: [],
                balances: { INR: { available: 0, pending: 0 } },
                capabilities: ["send", "receive"],
                isDefaultSend: true,
                isDefaultReceive: true,
                provider: "manual",
                status: "verified",
            });
        }

        if (pushToken) {
            await savePushToken({ userId: user._id, token: pushToken, platform });
        }

        const authToken = jwt.sign({ id: user._id }, JWT_SECRET, { expiresIn: "100d" });

        return res.status(200).json({
            responseBody: { "x-auth-token": authToken },
            user: { id: user._id, name: user.name, email: user.email, picture: user.picture },
            userId: user._id,
            newUser,
        });
    } catch (err) {
        console.error(" login failed:", err);
        return res.status(500).json({ error: "Server error" });
    }
});

// POST /dev-login
router.post("/dev-login", async (req, res) => {
    const { email, pushToken, platform } = req.body;
    if (!email) return res.status(400).json({ error: "Missing email id" });
    try {
        // Find or create user (same behavior as /login)
        let user = await User.findOne({ email });
        // Sign JWT (same expiry as your /login)
        const authToken = jwt.sign({ id: user._id }, JWT_SECRET, { expiresIn: "100d" });

        // Keep return format identical to /login
        return res.status(200).json({
            responseBody: { "x-auth-token": authToken },
            user: { id: user._id, name: user.name, email: user.email, picture: user.picture },
            userId: user._id
        });
    } catch (err) {
        console.error("dev-login failed:", err);
        return res.status(500).json({ error: "Server error" });
    }
});


router.get("/version", async (req, res) => {
    try {
        let adminDoc = await Admin.findOne().lean();

        if (!adminDoc) {
            // 👇 create default version document if none exists
            const defaultDoc = await Admin.create({
                minimumVersion: "1.0.0",
                minimumIOSVersion: "1.0.0",
                minimumAndroidVersion: "1.0.0",
            });
            adminDoc = defaultDoc.toObject();
        }

        res.json({
            minimumIOSVersion: adminDoc.minimumIOSVersion,
            minimumAndroidVersion: adminDoc.minimumAndroidVersion,
            androidVersionReview: adminDoc.androidVersionReview || null,
            iosVersionReview: adminDoc.iosVersionReview || null,
            newIOSVersion: adminDoc.newIOSVersion || null,
            newAndroidVersion: adminDoc.newAndroidVersion || null,
        });
    } catch (e) {
        console.error("Error fetching version:", e);
        res.status(500).json({ error: "Could not fetch version info" });
    }
});

// Non-auth route: just save token to Admin
router.post("/push-token/public", savePushTokenPublic);

// Authenticated route: save to User and Admin
router.post("/push-token", auth, savePushTokenAuthed);

// temp route to test phone-only user creation
router.post("/test-phone-login", async (req, res) => {
    const { phone } = req.body;
    if (!phone) return res.status(400).json({ error: "Missing phone" });

    try {
        let user = await User.findOne({ phone });
        let newUser = false;

        if (!user) {
            newUser = true;
            user = await User.create({ phone });

        }
        console.log();

        res.status(200).json({

            user: { id: user._id, name: user.name, phone: user.phone },
            newUser,
        });
    } catch (err) {
        console.error("Phone login failed:", err);
        res.status(500).json({ error: "Server error" });
    }
});

// Send OTP
router.post("/sendSMS", async (req, res) => {
    try {
        const { phoneNumber } = req.body;
        if (!phoneNumber) return res.status(400).json({ error: "Phone number required" });

        console.log("📲 Sending SMS to:", phoneNumber);

        // --- DEV BYPASS: simulate SMS send (no external call) ---
        const normalizedPhone = normalizePhone(phoneNumber);
        if (DEV_BYPASS_PHONES.has(normalizedPhone)) {
            console.log(`BYPASS sendSMS: simulating SMS send for ${normalizedPhone}`);

            // Optionally, record an entry in DB or in-memory log for debugging, e.g. save lastSentOtp for this number.
            // For simplicity we just return a 'pending' response similar to MSG91.
            return res.status(200).json({
                message: "OTP verified success",
                type: "success"
            });
        }


        const options = {
            method: "POST",
            hostname: "control.msg91.com",
            port: null,
            path: `/api/v5/otp?template_id=${process.env.MSG_TEMPLATE_ID}&mobile=${phoneNumber}&authkey=${process.env.MSG_AUTHKEY}`,
            headers: { "Content-Type": "application/json" },
        };

        const request = https.request(options, (response) => {
            let data = [];
            response.on("data", (chunk) => data.push(chunk));
            response.on("end", () => {
                const body = Buffer.concat(data).toString();
                try {
                    const parsed = JSON.parse(body);
                    console.log("MSG91 send response:", parsed);
                    return res.status(200).json(parsed);
                } catch (e) {
                    return res.status(500).json({ error: "Failed to parse SMS gateway response" });
                }
            });
        });

        request.on("error", (err) => {
            console.error("Error sending SMS:", err);
            res.status(500).json({ error: "SMS sending failed" });
        });

        request.end();
    } catch (error) {
        console.error("Error in /sendSMS:", error);
        res.status(500).json({ error: "Unexpected error" });
    }
});


router.post("/logging", async (req, res) => {
    try {
        console.log("📥 Logging endpoint hit:");
        // console.log("Headers:", req.headers);
        console.log("Body:", req.body);

        // respond so frontend doesn’t hang
        res.json({ success: true, received: req.body });
    } catch (err) {
        console.error("❌ Logging route error:", err);
        res.status(500).json({ error: "Logging failed" });
    }
});

router.get("/verifyWhatsapp", async (req, res) => {
    console.log('req: ', req);
    console.log('res: ', res);
    try {
        const { 'hub.mode': mode, 'hub.challenge': challenge, 'hub.verify_token': token } = req.query;

        if (mode === 'subscribe') {
            console.log('WEBHOOK VERIFIED');
            res.status(200).send(challenge);
        } else {
            res.status(403).end();
        }
    } catch (error) {
        console.log(error);

    }

});


// POST /verifyOTP (MSG91 only, no dev bypass)
router.post('/verifyOTP', async (req, res) => {
    const extractPhone = (body) => {
        if (!body) return null;
        if (typeof body.phoneNumber === 'string') return body.phoneNumber.trim();
        if (typeof body.phone === 'string') return body.phone.trim();
        for (const k of Object.keys(body || {})) {
            const v = body[k];
            if (typeof v === 'string' && /^\+?\d{10,15}$/.test(v.trim())) return v.trim();
        }
        return null;
    };

    try {
        console.log('verifyOTP body:', JSON.stringify(req.body));

        const phoneNumber = extractPhone(req.body);
        const code = req.body && (req.body.code || req.body.otp)
            ? String(req.body.code || req.body.otp).trim()
            : null;
        const pushToken = req.body?.pushToken ?? null;
        const platform = (req.body?.platform || '').toLowerCase();
        if (!phoneNumber) return res.status(400).json({ error: 'phoneNumber required' });
        if (!code) return res.status(400).json({ error: 'code (OTP) required' });
        // --- DEV BYPASS: accept any OTP for configured dev numbers ---
        const normalizedPhone = normalizePhone(phoneNumber);
        if (DEV_BYPASS_PHONES.has(normalizedPhone)) {
            console.log(`BYPASS verifyOTP: accepting OTP without gateway for ${normalizedPhone} (code='${code}')`);

            // Find-or-create user atomically with upsert to avoid duplicate-key race
            let user = null;
            let userNew = false;
            try {
                // setDefaultsOnInsert ensures defaults are applied on insert; new:true returns the updated/created doc
                user = await User.findOneAndUpdate(
                    { phone: normalizedPhone },
                    {
                        $setOnInsert: {
                            phone: normalizedPhone,
                            createdAt: new Date(),
                            // add other default fields you want when creating a new user:
                            // displayName: '', username: undefined, avatarId: null, ...
                        },
                    },
                    { upsert: true, new: true, setDefaultsOnInsert: true }
                ).exec();

                // If created just now, mongoose doesn't tell us directly — detect by a quick check:
                // If createdAt is within last few seconds consider new. Adjust threshold as needed.
                const createdAt = user?.createdAt ? new Date(user.createdAt).getTime() : 0;
                userNew = (Date.now() - createdAt) < 5000; // created <5s ago -> newly created
            } catch (e) {
                // If an unexpected duplicate-key still happens or other DB error, try a safe fallback find
                if (e && e.code === 11000) {
                    user = await User.findOne({ phone: normalizedPhone }).exec();
                    if (!user) {
                        console.error("BYPASS verifyOTP: duplicate-key race and user still missing (after upsert fallback)", e);
                        return res.status(500).json({ error: "Could not create or find user after duplicate-key race (bypass)" });
                    }
                } else {
                    throw e;
                }
            }


            // attach push token if provided
            if (pushToken) {
                const pushField = platform === "ios" ? "pushTokens.ios" : "pushTokens.android";
                await User.updateOne({ _id: user._id }, { $addToSet: { [pushField]: pushToken } }).catch((e) => {
                    console.warn("BYPASS verifyOTP: push token add warning:", e?.message || e);
                });
            }

            // Issue JWT
            const jwtToken = jwt.sign({ id: user._id }, JWT_SECRET, { expiresIn: "100d" });

            return res.status(200).json({
                new: user?.name ? (user?.name?.length === 0 ? true : userNew) : true,
                responseBody: { "x-auth-token": jwtToken },
                id: user._id,
                debug: { bypass: true },
            });
        }

        // ---- MSG91 verification ----
        const MSG_AUTH = process.env.MSG_AUTHKEY;
        if (!MSG_AUTH) {
            console.error('verifyOTP: MSG_AUTHKEY missing in env');
            return res.status(500).json({ error: 'SMS gateway misconfigured' });
        }

        const verifyBase = 'https://control.msg91.com/api/v5/otp/verify';
        const urlObj = new URL(verifyBase);
        urlObj.searchParams.set('otp', code);
        urlObj.searchParams.set('mobile', phoneNumber);

        const gatewayResponse = await new Promise((resolve, reject) => {
            const options = {
                method: 'GET',
                hostname: urlObj.hostname,
                port: 443,
                path: urlObj.pathname + urlObj.search,
                headers: { authkey: MSG_AUTH },
            };

            const r = https.request(options, (gRes) => {
                const chunks = [];
                gRes.on('data', (c) => chunks.push(c));
                gRes.on('end', () => {
                    try {
                        const buf = Buffer.concat(chunks);
                        const txt = buf.toString();
                        let parsed;
                        try { parsed = JSON.parse(txt); } catch { parsed = { raw: txt }; }
                        resolve({ status: gRes.statusCode, body: parsed });
                    } catch (e) { reject(e); }
                });
            });

            r.on('error', (err) => reject(err));
            r.end();
        });

        console.log('verifyOTP: MSG91 response:', gatewayResponse.status, JSON.stringify(gatewayResponse.body));
        const gw = gatewayResponse.body;
        if (!gw || gw.type !== 'success') {
            console.warn('verifyOTP: gateway verification failed', JSON.stringify(gw));
            return res.status(400).json({ error: 'OTP verification failed', detail: gw });
        }

        // ---- User creation / lookup ----
        // Find-or-create user atomically with upsert to avoid duplicate-key race
        let user = null;
        let userNew = false;
        try {
            // setDefaultsOnInsert ensures defaults are applied on insert; new:true returns the updated/created doc
            user = await User.findOneAndUpdate(
                { phone: normalizedPhone },
                {
                    $setOnInsert: {
                        phone: normalizedPhone,
                        createdAt: new Date(),
                        // add other default fields you want when creating a new user:
                        // displayName: '', username: undefined, avatarId: null, ...
                    },
                },
                { upsert: true, new: true, setDefaultsOnInsert: true }
            ).exec();

            // If created just now, mongoose doesn't tell us directly — detect by a quick check:
            // If createdAt is within last few seconds consider new. Adjust threshold as needed.
            const createdAt = user?.createdAt ? new Date(user.createdAt).getTime() : 0;
            userNew = (Date.now() - createdAt) < 5000; // created <5s ago -> newly created
        } catch (e) {
            // If an unexpected duplicate-key still happens or other DB error, try a safe fallback find
            if (e && e.code === 11000) {
                user = await User.findOne({ phone: normalizedPhone }).exec();
                if (!user) {
                    console.error("BYPASS verifyOTP: duplicate-key race and user still missing (after upsert fallback)", e);
                    return res.status(500).json({ error: "Could not create or find user after duplicate-key race (bypass)" });
                }
            } else {
                throw e;
            }
        }


        // ---- Push token handling ----
        if (pushToken) {
            const pushField = platform === 'ios' ? 'pushTokens.ios' : 'pushTokens.android';
            await User.updateOne({ _id: user._id }, { $addToSet: { [pushField]: pushToken } }).catch(e => {
                console.warn('verifyOTP: push token add warning:', e?.message || e);
            });
        }

        // ---- JWT issue ----
        const jwtToken = jwt.sign({ id: user._id }, JWT_SECRET, { expiresIn: '100d' });
        console.log(userNew, userNew);

        return res.status(200).json({
            new: user?.name ? user?.name?.length == 0 ? true : userNew : true,
            responseBody: { 'x-auth-token': jwtToken },
            id: user._id
        });
    } catch (err) {
        console.error('verifyOTP unexpected error:', err?.stack || err);
        return res.status(500).json({ error: 'Internal server error', detail: String(err?.message || err) });
    }
});


// POST /v1/users/verify-phone-link
router.post('/verify-phone-link', auth, async (req, res) => {
    try {
        const phoneNumber = (req.body && (req.body.phoneNumber || req.body.phone)) ? String(req.body.phoneNumber || req.body.phone).trim() : null;
        const code = req.body && (req.body.code || req.body.otp) ? String(req.body.code || req.body.otp).trim() : null;
        if (!phoneNumber) return res.status(400).json({ error: 'phoneNumber required' });
        if (!code) return res.status(400).json({ error: 'code (OTP) required' });

        console.log('[verify-phone-link] incoming phone:', phoneNumber, 'otp:', code);

        // DEV bypass (optional)
        const normalizedPhone = normalizePhone(phoneNumber);
        if (DEV_BYPASS_PHONES.has(normalizedPhone)) {
            console.log('[verify-phone-link] dev bypass - attaching phone', normalizedPhone, 'to user', req.user.id);
            await User.findByIdAndUpdate(req.user.id, { $set: { phone: normalizedPhone } }, { new: true });
            const fresh = await User.findById(req.user.id).lean();
            return res.status(200).json({ success: true, phone: normalizedPhone, user: { id: fresh._id, phone: fresh.phone } });
        }

        const MSG_AUTH = process.env.MSG_AUTHKEY;
        if (!MSG_AUTH) {
            console.warn('[verify-phone-link] MSG_AUTH missing');
            return res.status(500).json({ error: 'SMS gateway misconfigured' });
        }

        // verify OTP with gateway (MSG91 style)
        const verifyBase = 'https://control.msg91.com/api/v5/otp/verify';
        const urlObj = new URL(verifyBase);
        urlObj.searchParams.set('otp', code);
        urlObj.searchParams.set('mobile', phoneNumber);

        console.log('[verify-phone-link] calling SMS gateway', urlObj.toString());

        const gatewayResponse = await new Promise((resolve, reject) => {
            const options = {
                method: 'GET',
                hostname: urlObj.hostname,
                port: 443,
                path: urlObj.pathname + urlObj.search,
                headers: { authkey: MSG_AUTH },
            };

            const r = https.request(options, (gRes) => {
                const chunks = [];
                gRes.on('data', (c) => chunks.push(c));
                gRes.on('end', () => {
                    try {
                        const buf = Buffer.concat(chunks);
                        const txt = buf.toString();
                        let parsed;
                        try { parsed = JSON.parse(txt); } catch (e) { parsed = { raw: txt }; }
                        resolve({ status: gRes.statusCode, body: parsed });
                    } catch (e) { reject(e); }
                });
            });

            r.on('error', (err) => reject(err));
            r.end();
        });

        console.log('[verify-phone-link] gateway response:', JSON.stringify(gatewayResponse).slice(0, 2000));

        const gw = gatewayResponse.body;
        if (!gw || gw.type !== 'success') {
            console.warn('[verify-phone-link] gateway rejected OTP', gw);
            return res.status(400).json({ error: 'OTP verification failed', detail: gw });
        }

        // Normalize phone and double-check collisions.
        const phoneNormalized = normalizedPhone;
        console.log('[verify-phone-link] normalized phone:', phoneNormalized);

        // Try transactional update (best) — if not available we fall back.
        let session = null;
        try {
            session = await mongoose.startSession();
            let resultUser = null;

            await session.withTransaction(async () => {
                console.log('[verify-phone-link] running transaction check/update');

                // re-check for existing phone under the same session
                const existing = await User.findOne({ phone: phoneNormalized }).session(session).lean();
                if (existing && String(existing._id) !== String(req.user.id)) {
                    const err = new Error('Phone number already linked with another account.');
                    err.status = 409;
                    throw err; // abort transaction
                }

                // update the current user record inside session
                resultUser = await User.findOneAndUpdate(
                    { _id: req.user.id },
                    { $set: { phone: phoneNormalized } },
                    { new: true, session, useFindAndModify: false }
                );

                if (!resultUser) {
                    const err = new Error('Authenticated user not found');
                    err.status = 404;
                    throw err;
                }
            });

            // transaction committed
            console.log('[verify-phone-link] transaction committed, resultUser id:', resultUser?._id);
            // read fresh doc (outside session) to be certain
            const fresh = await User.findById(req.user.id).lean();
            return res.status(200).json({ success: true, phone: phoneNormalized, user: { id: fresh._id, phone: fresh.phone } });
        } catch (txErr) {
            // handle our deliberate errors
            if (txErr && txErr.status === 409) {
                console.warn('[verify-phone-link] tx conflict:', txErr.message);
                return res.status(409).json({ error: txErr.message });
            }
            if (txErr && txErr.status === 404) {
                return res.status(404).json({ error: txErr.message });
            }

            // transactions might not be supported or committed; fall back
            console.warn('[verify-phone-link] transaction failed/unavailable, falling back. err:', txErr?.message || txErr);
        } finally {
            if (session) {
                try { session.endSession(); } catch (e) { console.warn('session end error', e); }
            }
        }

        // ----------------- Fallback path -----------------
        console.log('[verify-phone-link] fallback: checking existing phone (non-transactional)');
        const existing = await User.findOne({ phone: phoneNormalized }).lean();
        if (existing && String(existing._id) !== String(req.user.id)) {
            console.warn('[verify-phone-link] fallback conflict - phone already in use by', existing._id);
            return res.status(409).json({ error: 'Phone number already linked with another account.' });
        }

        // Perform the update guardedly — then read the document back and return it.
        try {
            console.log('[verify-phone-link] fallback update: findByIdAndUpdate', req.user.id);
            const updated = await User.findByIdAndUpdate(req.user.id, { $set: { phone: phoneNormalized } }, { new: true, runValidators: true });
            console.log('[verify-phone-link] fallback update result (may be null):', !!updated);

            // Read fresh user doc to confirm
            const fresh = await User.findById(req.user.id).lean();
            if (!fresh) {
                console.error('[verify-phone-link] user not found after update', req.user.id);
                return res.status(404).json({ error: 'Authenticated user not found after update' });
            }

            // If phone not present on fresh doc, then something went wrong with the write
            if (!fresh.phone || String(fresh.phone) !== String(phoneNormalized)) {
                console.error('[verify-phone-link] write seemingly succeeded but DB read does not show phone. fresh.phone:', fresh.phone);
                return res.status(500).json({
                    error: 'Phone verification succeeded but attaching phone failed (DB read mismatch).',
                    detail: { expected: phoneNormalized, got: fresh.phone },
                });
            }

            console.log('[verify-phone-link] SUCCESS - attached phone to user', req.user.id);
            return res.status(200).json({ success: true, phone: phoneNormalized, user: { id: fresh._id, phone: fresh.phone } });
        } catch (updateErr) {
            console.error('[verify-phone-link] fallback update error:', updateErr);

            // robust duplicate detection
            const isDup =
                updateErr &&
                (updateErr.code === 11000 ||
                    (updateErr.codeName && updateErr.codeName === 'DuplicateKey') ||
                    (String(updateErr?.errmsg || updateErr?.message || '').indexOf('E11000') !== -1) ||
                    (updateErr.keyValue && updateErr.keyValue.phone));

            if (isDup) {
                console.warn('[verify-phone-link] duplicate-key race detected in fallback update');
                return res.status(409).json({ error: 'Phone number already linked with another account (race condition).' });
            }

            return res.status(500).json({ error: 'Failed to attach phone', detail: String(updateErr?.message || updateErr) });
        }
    } catch (err) {
        console.error('[verify-phone-link] unexpected error:', err?.stack || err);
        return res.status(500).json({ error: 'Server error', detail: String(err?.message || err) });
    }
});


// POST /v1/users/link-google
// Body: { id_token: string }
// Auth: required (req.user.id is the current authenticated user)
router.post('/link-google', auth, async (req, res) => {
    try {
        const { id_token } = req.body;
        if (!id_token) return res.status(400).json({ error: 'Missing id_token' });

        // Verify the ID token with Google; allow list of audiences
        let ticket;
        try {
            ticket = await client.verifyIdToken({
                idToken: id_token,
                audience: [
                    process.env.GOOGLE_WEB_CLIENT_ID,
                    process.env.GOOGLE_ANDROID_CLIENT_ID,
                    process.env.GOOGLE_IOS_CLIENT_ID,
                ].filter(Boolean),
            });
        } catch (err) {
            console.error('link-google: token verify error:', err);
            return res.status(401).json({ error: 'Invalid Google ID token' });
        }

        const payload = ticket.getPayload();
        if (!payload || !payload.email) return res.status(400).json({ error: 'Google token missing email' });

        const googleEmail = String(payload.email).toLowerCase();
        const emailVerified = payload.email_verified === true || payload.email_verified === 'true';
        const googleId = payload.sub;
        const nameFromGoogle = payload.name || payload.given_name || payload.family_name || null;
        const picture = payload.picture || null;

        if (!emailVerified) {
            return res.status(400).json({ error: 'Google email is not verified' });
        }

        const currentUserId = req.user.id;
        const currentUser = await User.findById(currentUserId);
        if (!currentUser) return res.status(404).json({ error: 'Authenticated user not found' });

        // Check for existing user with this email
        const existing = await User.findOne({ email: googleEmail }).lean();

        if (existing && String(existing._id) !== String(currentUserId)) {
            // If the existing user does not have the same googleId, it's a conflict
            if (!existing.googleId || String(existing.googleId) !== String(googleId)) {
                return res.status(409).json({
                    error: 'Email already in use by another account. If this is your account, sign in to that account and link there.',
                });
            }
            // If existing.googleId matches googleId, it's the same account (maybe duplicate record), allow linking to proceed
        }

        // Prepare updates: attach email + googleId if needed
        const updatedFields = {};
        if (!currentUser.email || currentUser.email !== googleEmail) updatedFields.email = googleEmail;
        if (!currentUser.googleId || String(currentUser.googleId) !== String(googleId)) updatedFields.googleId = googleId;
        if (!currentUser.name && nameFromGoogle) updatedFields.name = nameFromGoogle;
        if (!currentUser.profilePic && picture) updatedFields.profilePic = picture;
        // if you have a boolean emailVerified flag
        if (typeof currentUser.emailVerified === 'boolean') updatedFields.emailVerified = true;

        if (Object.keys(updatedFields).length) {
            try {
                await User.updateOne({ _id: currentUserId }, { $set: updatedFields });
            } catch (e) {
                // Handle duplicate key error from race conditions: if attempting to set email that got claimed meanwhile
                if (e && e.code === 11000 && e.keyValue && e.keyValue.email) {
                    return res.status(409).json({ error: 'Email already in use by another account.' });
                }
                throw e;
            }
        }

        const freshUser = await User.findById(currentUserId).lean();

        return res.status(200).json({
            success: true,
            user: {
                id: freshUser._id,
                name: freshUser.name,
                email: freshUser.email,
                picture: freshUser.profilePic || freshUser.picture || null,
                googleId: freshUser.googleId || null,
            },
        });
    } catch (err) {
        console.error('link-google unexpected error:', err?.stack || err);
        return res.status(500).json({ error: 'Failed to link Google account', detail: String(err?.message || err) });
    }
});



module.exports = router;
