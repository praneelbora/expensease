import Cookies from "js-cookie";

// PaymentMethodService.js
const BASE_URL = import.meta.env.VITE_BACKEND_URL;

// --- helpers ---
const withAuthHeaders = (token) => ({
    "Content-Type": "application/json",
    "x-auth-token": token,
});

const handle = async (res, fallbackMsg) => {
    let data;
    try { data = await res.json(); } catch { }
    if (!res.ok) {
        const msg = (data && (data.message || data.error)) || fallbackMsg;
        throw new Error(msg);
    }
    return data;
};

const qs = (params = {}) => {
    const q = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => {
        if (v !== undefined && v !== null && v !== "") q.set(k, v);
    });
    const s = q.toString();
    return s ? `?${s}` : "";
};

/**
 * PaymentMethod payload (create/update)
 * {
 *   label: string,
 *   type: "upi"|"bank"|"card"|"cash"|"wallet",
 *   defaultCurrency?: string,           // e.g. "INR"
 *   supportedCurrencies?: string[],     // [] or omit = allow any
 *   capabilities?: string[],            // ["send","receive",...]
 *   provider?: "manual"|"stripe"|"razorpay"|"payu",
 *   providerRef?: string,
 *   upi?:  { handle?: string },
 *   bank?: { ifsc?: string, accountLast4?: string, nameOnAccount?: string },
 *   card?: { brand?: string, last4?: string, expMonth?: number, expYear?: number }
 * }
 */

// --- PaymentMethods (profile) ---

/** Create an paymentMethod */
export const createPaymentMethod = async (payload, userToken) => {
    const res = await fetch(`${BASE_URL}/v1/paymentMethods`, {
        method: "POST",
        headers: withAuthHeaders(userToken),
        body: JSON.stringify(payload),
    });
    return handle(res, "Failed to create paymentMethods");
};

/** List paymentMethodss (optional filters: { type, status }) */
export const listPaymentMethods = async (filters = {}) => {
    const userToken = Cookies.get("userToken");
    if (!userToken) return null;
    console.log(filters);
    console.log(qs(filters));

    const res = await fetch(
        `${BASE_URL}/v1/paymentMethods`,
        { headers: withAuthHeaders(userToken) }
    );
    return handle(res, "Failed to fetch paymentMethodss");
};

/** Get single paymentMethods by id */
export const getPaymentMethod = async (paymentMethodId, userToken) => {
    const res = await fetch(`${BASE_URL}/v1/paymentMethods/${paymentMethodId}`, {
        headers: withAuthHeaders(userToken),
    });
    return handle(res, "Failed to fetch paymentMethods");
};

/** Update paymentMethods (PATCH) */
export const updatePaymentMethod = async (paymentMethodId, payload, userToken) => {
    const res = await fetch(`${BASE_URL}/v1/paymentMethods/${paymentMethodId}`, {
        method: "PATCH",
        headers: withAuthHeaders(userToken),
        body: JSON.stringify(payload),
    });
    return handle(res, "Failed to update paymentMethods");
};

/** Delete paymentMethods */
export const deletePaymentMethod = async (paymentMethodId, userToken) => {
    const res = await fetch(`${BASE_URL}/v1/paymentMethods/${paymentMethodId}`, {
        method: "DELETE",
        headers: withAuthHeaders(userToken),
    });
    return handle(res, "Failed to delete paymentMethods");
};

// --- Defaults convenience ---

/** Mark paymentMethods as default send (ensures uniqueness server-side) */
export const setDefaultSend = async (paymentMethodId, userToken) => {
    return updatePaymentMethod(paymentMethodId, { isDefaultSend: true }, userToken);
};

/** Mark paymentMethods as default receive (ensures uniqueness server-side) */
export const setDefaultReceive = async (paymentMethodId, userToken) => {
    return updatePaymentMethod(paymentMethodId, { isDefaultReceive: true }, userToken);
};

// --- Balances ---

/** Get balances map for an paymentMethods */
export const getBalances = async (paymentMethodId, userToken) => {
    const res = await fetch(`${BASE_URL}/v1/paymentMethods/${paymentMethodId}/balances`, {
        headers: withAuthHeaders(userToken),
    });
    return handle(res, "Failed to fetch balances");
};

/**
 * Credit balance
 * body: { currency, amount, bucket = "available" }
 * amount is in minor units (integer)
 */
export const creditBalance = async (paymentMethodId, body, userToken) => {
    const res = await fetch(`${BASE_URL}/v1/paymentMethods/${paymentMethodId}/balances/credit`, {
        method: "POST",
        headers: withAuthHeaders(userToken),
        body: JSON.stringify(body),
    });
    return handle(res, "Credit failed");
};

/**
 * Debit balance
 * body: { currency, amount, bucket = "available" }
 * amount is in minor units (integer)
 */
export const debitBalance = async (paymentMethodId, body, userToken) => {
    const res = await fetch(`${BASE_URL}/v1/paymentMethods/${paymentMethodId}/balances/debit`, {
        method: "POST",
        headers: withAuthHeaders(userToken),
        body: JSON.stringify(body),
    });
    return handle(res, "Debit failed");
};

/**
 * Hold funds (available -> pending)
 * body: { currency, amount }
 */
export const holdBalance = async (paymentMethodId, body, userToken) => {
    const res = await fetch(`${BASE_URL}/v1/paymentMethods/${paymentMethodId}/balances/hold`, {
        method: "POST",
        headers: withAuthHeaders(userToken),
        body: JSON.stringify(body),
    });
    return handle(res, "Hold failed");
};

/**
 * Release funds (pending -> available)
 * body: { currency, amount }
 */
export const releaseBalance = async (paymentMethodId, body, userToken) => {
    const res = await fetch(`${BASE_URL}/v1/paymentMethods/${paymentMethodId}/balances/release`, {
        method: "POST",
        headers: withAuthHeaders(userToken),
        body: JSON.stringify(body),
    });
    return handle(res, "Release failed");
};

// --- Transfers & usage ---

/**
 * Transfer between two paymentMethodss (same user)
 * body: {
 *   fromPaymentMethodId, toPaymentMethodId, currency, amount,
 *   fromBucket?: "available"|"pending",
 *   toBucket?: "available"|"pending"
 * }
 */
export const transferBetweenPaymentMethods = async (body, userToken) => {
    const res = await fetch(`${BASE_URL}/v1/paymentMethods/transfer`, {
        method: "POST",
        headers: withAuthHeaders(userToken),
        body: JSON.stringify(body),
    });
    return handle(res, "Transfer failed");
};

/** Increment usageCount (e.g., after payment): by (default 1) */
export const bumpPaymentMethodUsage = async (paymentMethodId, by = 1, userToken) => {
    const res = await fetch(`${BASE_URL}/v1/paymentMethods/${paymentMethodId}/usage`, {
        method: "POST",
        headers: withAuthHeaders(userToken),
        body: JSON.stringify({ by }),
    });
    return handle(res, "Failed to update usage");
};

export const fetchFriendsPaymentMethods = async (friendIds, userToken) => {
    const res = await fetch(`${BASE_URL}/v1/paymentMethods/public/friends`, {
        method: "POST",
        headers: withAuthHeaders(userToken),
        body: JSON.stringify({ friendIds }),
    });
    return handle(res, "Failed to fetch payment accounts");
};

/** List transactions (optionally filter by method, currency, kind, before cursor) */
export const listPaymentTxns = async (params = {}, userToken) => {
    const qs = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => {
        if (v !== undefined && v !== null && v !== "") {
            qs.append(k, v);
        }
    });

    const res = await fetch(`${BASE_URL}/v1/paymentMethods/transactions/get/?${qs.toString()}`, {
        method: "GET",
        headers: withAuthHeaders(userToken),
    });

    return handle(res, "Failed to load transactions");
};

