// src/services/ExpenseService.js
import { api } from "../utils/api";

const BASE = "/v1/expenses";

// Create
export const createExpense = async (expenseData) => {
  // apiClient handles token + JSON + errors
  return api.post(`${BASE}`, expenseData);
};

// Delete
export const deleteExpense = async (expenseId) => {
  return api.del(`${BASE}/${expenseId}`);
};

// List all (optionally accept filters later)
export const getAllExpenses = async () => {
  return api.get(`${BASE}`);
};

// Settle (payer -> receiver)
export const settleExpense = async (
  { payerId, receiverId, amount, description, groupId, currency }
) => {
  if (!payerId || !receiverId || !amount) {
    throw new Error("Please fill all required fields.");
  }

  const body = {
    fromUserId: payerId,
    toUserId: receiverId,
    amount: parseFloat(amount),
    description,
    currency,
    ...(groupId ? { groupId } : {}),
  };

  return api.post(`${BASE}/settle`, body);
};

// Friend-specific expenses
export const getFriendExpense = async (friendId) => {
  return api.get(`${BASE}/friend/${friendId}`);
};

// Update (PUT)
export const updateExpense = async (id, payload) => {
  return api.put(`${BASE}/${id}`, payload);
};
