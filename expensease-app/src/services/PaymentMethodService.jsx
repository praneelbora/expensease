import { api } from "../utils/api";

const BASE = "/v1/paymentMethods";

export const createPaymentMethod = (payload) =>
    api.post(`${BASE}`, payload, {});

export const listPaymentMethods = (filters = {}) =>
    api.get(`${BASE}`, filters);

export const getPaymentMethod = (paymentMethodId) =>
    api.get(`${BASE}/${paymentMethodId}`);

export const updatePaymentMethod = (paymentMethodId, payload) =>
    api.patch(`${BASE}/${paymentMethodId}`, payload);

export const deletePaymentMethod = (paymentMethodId) =>
    api.del(`${BASE}/${paymentMethodId}`);

// Defaults
export const setDefaultSend = (paymentMethodId) =>
    updatePaymentMethod(paymentMethodId, { isDefaultSend: true });

export const setDefaultReceive = (paymentMethodId) =>
    updatePaymentMethod(paymentMethodId, { isDefaultReceive: true });

// Balances
export const getBalances = (paymentMethodId) =>
    api.get(`${BASE}/${paymentMethodId}/balances`);

export const creditBalance = (paymentMethodId, body) =>
    api.post(`${BASE}/${paymentMethodId}/balances/credit`, body);

export const debitBalance = (paymentMethodId, body) =>
    api.post(`${BASE}/${paymentMethodId}/balances/debit`, body);

export const holdBalance = (paymentMethodId, body) =>
    api.post(`${BASE}/${paymentMethodId}/balances/hold`, body);

export const releaseBalance = (paymentMethodId, body) =>
    api.post(`${BASE}/${paymentMethodId}/balances/release`, body);

// Transfers & usage
export const transferBetweenPaymentMethods = (body) =>
    api.post(`${BASE}/transfer`, body);

export const bumpPaymentMethodUsage = (paymentMethodId, by = 1) =>
    api.post(`${BASE}/${paymentMethodId}/usage`, { by });

export const fetchFriendsPaymentMethods = (friendIds) =>
    api.post(`${BASE}/public/friends`, { friendIds });

export const listPaymentTxns = (params = {}) =>
    api.get(`${BASE}/transactions/get/`, params);
