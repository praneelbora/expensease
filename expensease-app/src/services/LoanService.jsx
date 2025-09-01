// src/services/LoanService.js
import { api } from "../utils/api";

const BASE = "/v1/loans";

// --- Loans ---

// loanData: { lenderId, borrowerId, principal, currency?, interestRate?, estimatedReturnDate?, description?, notes? }
export const createLoan = (loanData) =>
    api.post(`${BASE}`, loanData);

// params: { role?: 'lender'|'borrower'|'all', status?: 'open'|'partially_repaid'|'closed' }
export const getLoans = (params = {}) =>
    api.get(`${BASE}`, params);

export const getLoanById = (loanId) =>
    api.get(`${BASE}/${loanId}`);

export const updateLoan = (loanId, patch) =>
    api.patch(`${BASE}/${loanId}`, patch);

export const deleteLoan = (loanId) =>
    api.del(`${BASE}/${loanId}`);

// --- Repayments ---

// payload: { amount: number, at?: DateString, note?: string }
export const addRepayment = (loanId, payload) =>
    api.post(`${BASE}/${loanId}/repay`, payload);

export const deleteRepayment = (loanId, repaymentId) =>
    api.del(`${BASE}/${loanId}/repayments/${repaymentId}`);

// --- Status actions ---

// payload: { actualReturnDate?: DateString }
export const closeLoan = (loanId, payload = {}) =>
    api.patch(`${BASE}/${loanId}/close`, payload);

// --- Attachments (metadata only) ---

// attachments = [{ fileUrl, fileName }]
export const addAttachments = (loanId, attachments) =>
    api.post(`${BASE}/${loanId}/attachments`, { attachments });

export const removeAttachment = (loanId, attachmentId) =>
    api.del(`${BASE}/${loanId}/attachments/${attachmentId}`);
