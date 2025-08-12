// LoanService.js
const BASE_URL = import.meta.env.VITE_BACKEND_URL;

// --- helpers ---
const withAuthHeaders = (token) => ({
    "Content-Type": "application/json",
    "x-auth-token": token,
});

const handle = async (res, fallbackMsg) => {
    let data;
    try {
        data = await res.json();
    } catch {
        // no body or non-JSON
    }
    if (!res.ok) {
        const msg = (data && (data.message || data.error)) || fallbackMsg;
        throw new Error(msg);
    }
    return data;
};

// --- Loans ---

// Create a loan
// loanData: { lenderId, borrowerId, principal, currency?, interestRate?, estimatedReturnDate?, description?, notes? }
export const createLoan = async (loanData, userToken) => {
    const res = await fetch(`${BASE_URL}/v1/loans`, {
        method: "POST",
        headers: withAuthHeaders(userToken),
        body: JSON.stringify(loanData),
    });
    return handle(res, "Failed to create loan");
};

// Get my loans (optionally filter by role/status)
// params: { role?: 'lender'|'borrower'|'all', status?: 'open'|'partially_repaid'|'closed' }
export const getLoans = async (userToken, params = {}) => {
    const query = new URLSearchParams(params).toString();
    const res = await fetch(`${BASE_URL}/v1/loans${query ? `?${query}` : ""}`, {
        method: "GET",
        headers: withAuthHeaders(userToken),
    });
    return handle(res, "Failed to fetch loans");
};

// Get single loan by id
export const getLoanById = async (loanId, userToken) => {
    const res = await fetch(`${BASE_URL}/v1/loans/${loanId}`, {
        method: "GET",
        headers: withAuthHeaders(userToken),
    });
    return handle(res, "Failed to fetch loan details");
};

// Update loan (partial)
// patch: { interestRate?, estimatedReturnDate?, description?, notes?, status? (careful), currency? }
export const updateLoan = async (loanId, patch, userToken) => {
    const res = await fetch(`${BASE_URL}/v1/loans/${loanId}`, {
        method: "PATCH",
        headers: withAuthHeaders(userToken),
        body: JSON.stringify(patch),
    });
    return handle(res, "Failed to update loan");
};

// Delete loan (usually only allowed if no repayments)
export const deleteLoan = async (loanId, userToken) => {
    const res = await fetch(`${BASE_URL}/v1/loans/${loanId}`, {
        method: "DELETE",
        headers: withAuthHeaders(userToken),
    });
    return handle(res, "Failed to delete loan");
};

// --- Repayments ---

// Add a repayment
// payload: { amount: number, at?: DateString, note?: string }
export const addRepayment = async (loanId, payload, userToken) => {
    const res = await fetch(`${BASE_URL}/v1/loans/${loanId}/repay`, {
        method: "POST",
        headers: withAuthHeaders(userToken),
        body: JSON.stringify(payload),
    });
    return handle(res, "Failed to add repayment");
};

// Delete a repayment
export const deleteRepayment = async (loanId, repaymentId, userToken) => {
    const res = await fetch(
        `${BASE_URL}/v1/loans/${loanId}/repayments/${repaymentId}`,
        {
            method: "DELETE",
            headers: withAuthHeaders(userToken),
        }
    );
    return handle(res, "Failed to delete repayment");
};

// --- Status actions ---

// Close a loan (optionally set actualReturnDate)
// payload: { actualReturnDate?: DateString }
export const closeLoan = async (loanId, payload = {}, userToken) => {
    const res = await fetch(`${BASE_URL}/v1/loans/${loanId}/close`, {
        method: "PATCH",
        headers: withAuthHeaders(userToken),
        body: JSON.stringify(payload),
    });
    return handle(res, "Failed to close loan");
};

// --- Attachments (metadata only; upload files via your uploader, then save urls here) ---

// Add attachments: attachments = [{ fileUrl, fileName }]
export const addAttachments = async (loanId, attachments, userToken) => {
    const res = await fetch(`${BASE_URL}/v1/loans/${loanId}/attachments`, {
        method: "POST",
        headers: withAuthHeaders(userToken),
        body: JSON.stringify({ attachments }),
    });
    return handle(res, "Failed to add attachments");
};

// Remove a single attachment by its _id (from the loan document)
export const removeAttachment = async (loanId, attachmentId, userToken) => {
    const res = await fetch(
        `${BASE_URL}/v1/loans/${loanId}/attachments/${attachmentId}`,
        {
            method: "DELETE",
            headers: withAuthHeaders(userToken),
        }
    );
    return handle(res, "Failed to remove attachment");
};
