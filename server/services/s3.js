// utils/s3.js
const { S3Client, PutObjectCommand, GetObjectCommand } = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");
const crypto = require("crypto");
const path = require("path");

const S3_REGION = process.env.S3_REGION;
const S3_BUCKET = process.env.S3_BUCKET;
const S3_PUBLIC_BASE_URL = process.env.S3_PUBLIC_BASE_URL || null;

if (!S3_REGION || !S3_BUCKET) {
  console.warn("⚠️  S3_REGION / S3_BUCKET not set");
}

const s3 = new S3Client({ region: S3_REGION });

function randomKey(ext = "") {
  const id = crypto.randomUUID();
  return `${id}${ext ? `.${ext.replace(/^\./, "")}` : ""}`;
}

function datePrefix(userId = "anonymous") {
  const d = new Date();
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `receipts/${userId}/${y}/${m}/${dd}`;
}

async function uploadBufferToS3({ buffer, contentType, userId, originalName }) {
  const ext = (path.extname(originalName || "") || "").replace(".", "").toLowerCase() || "jpg";
  const key = `${datePrefix(userId)}/${randomKey(ext)}`;

  const cmd = new PutObjectCommand({
    Bucket: S3_BUCKET,
    Key: key,
    Body: buffer,
    ContentType: contentType || "application/octet-stream",
    ACL: "private",
  });

  const resp = await s3.send(cmd);

  let url = null;
  if (S3_PUBLIC_BASE_URL) {
    url = `${S3_PUBLIC_BASE_URL.replace(/\/$/, "")}/${key}`;
  }
  return { bucket: S3_BUCKET, key, etag: resp.ETag, url };
}

async function getSignedGetUrl(key, expiresIn = 600) {
  const cmd = new GetObjectCommand({ Bucket: S3_BUCKET, Key: key });
  return getSignedUrl(s3, cmd, { expiresIn });
}

module.exports = {
  s3,
  uploadBufferToS3,
  getSignedGetUrl,
};
