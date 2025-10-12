// src/services/ExpenseService.js
import { api } from "../utils/api";

const BASE = "/v1/expenses";
const BASE2 = "/v2/expenses";

// Create
export const createExpense = async (expenseData) => {
    // apiClient handles token + JSON + errors
    return api.post(`${BASE2}`, expenseData);
};

// Delete
export const deleteExpense = async (expenseId) => {
    return api.del(`${BASE}/${expenseId}`);
};

// List all (optionally accept filters later)
export const getAllExpenses = async () => {
    return api.get(`${BASE}`);
};
export const settleExpense = async ({ payerId, receiverId, amount, description, currency, meta = null, groupId = null },
    userToken
) => {
    if (!payerId || !receiverId || !(Number(amount) > 0)) {
        throw new Error("Please fill all required fields.");
    }

    // normalize meta.ids -> array if it's an object
    let groupIds = undefined;
    if (meta?.ids) {

        if (Array.isArray(meta.ids)) {
            groupIds = meta.ids;
        } else if (typeof meta.ids === "object") {
            // { groupId: {...}, ... } -> keys
            groupIds = Object.keys(meta.ids);
        }
    }
    else
        // If meta contains groups object (older shape), prefer keys of groups
        if (!groupIds && meta?.groups && typeof meta.groups === "object") {
            groupIds = Object.keys(meta.groups);
        }

    const body = {
        fromUserId: payerId,
        toUserId: receiverId,
        amount: parseFloat(amount),
        description,
        note: description,
        currency,
        ...(groupId ? { groupId } : {}),
        ...(meta?.type ? { type: meta.type } : {}),
        ...(groupIds ? { groupIds } : {}),
        ...(meta?.groupId ? { groupId: meta.groupId } : {}),
        ...(meta ? { meta } : {}),
    };
    return api.post(`${BASE2}/settle`, body);
};


// Friend-specific expenses
export const getFriendExpense = async (friendId) => {
    return api.get(`${BASE2}/friend/${friendId}`);
};

// Update (PUT)
export const updateExpense = async (id, payload) => {
    return api.put(`${BASE}/${id}`, payload);
};
