// src/services/ImageService.js
import { api } from "../utils/api";

export const uploadReceipt = async (file) => {
  console.log("📸 uploading file:", file);

  const fd = new FormData();
  fd.append("image", {   // ✅ MATCHES upload.single("image")
    uri: file.uri,
    name: file.name || "receipt.jpg",
    type: "image/jpeg",
  });

  // ✅ no manual Content-Type
  return api.post("/v1/image", fd, {
    headers: { Accept: "application/json" },
  });
};
