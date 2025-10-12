// src/services/ImageService.js
import { api } from "../utils/api";

/**
 * Upload a receipt image to the server (S3 via backend)
 */
export const uploadReceipt = async (file) => {
  const fd = new FormData();
  fd.append("image", {
    uri: file.uri,
    name: file.name || "receipt.jpg",
    type: "image/jpeg",
  });

  return api.post("/v1/image", fd, {
    headers: { Accept: "application/json" },
  });
};

/**
 * Get a signed URL for a given receipt ID.
 * The backend must expose GET /v1/image/:id/signed-url
 * which returns { url: "https://..." }
 */
export const getSignedReceiptUrl = async (receiptId) => {
  if (!receiptId) throw new Error("Missing receipt ID");

  try {
    const res = await api.get(`/v1/image/${receiptId}/signed-url`, {
      headers: { Accept: "application/json" },
    });
    if (res?.url) {
      return res.url;
    } else {
      throw new Error("Signed URL not found in response");
    }
  } catch (err) {
    console.error("❌ getSignedReceiptUrl error:", err?.response?.data || err.message);
    throw err;
  }
};
