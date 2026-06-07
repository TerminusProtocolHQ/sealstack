// SealStack — canonical Seal reference library (Seal Spec v1.0).
// Zero dependencies. Node 18+. This is the ONE implementation of sealing;
// import it everywhere instead of re-deriving the hash, so every tool agrees.

import { createHash } from "node:crypto";

export const SEAL_SPEC_VERSION = "1.0";

// The fingerprint ("seal") covers title + body ONLY. Canonicalization:
//   1. title: trim leading/trailing whitespace.
//   2. body : convert CRLF -> LF, then trim.
//   3. canon: JSON.stringify({title, body}) in EXACTLY that key order.
//   4. seal : "sha256:" + hex(sha256(utf8(canon))).
export function sealFingerprint(title, body) {
  const canon = JSON.stringify({
    title: String(title).trim(),
    body: String(body).replace(/\r\n/g, "\n").trim(),
  });
  return "sha256:" + createHash("sha256").update(canon, "utf8").digest("hex");
}

export function slugify(s) {
  return String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48) || "seal";
}

// id = slug(title) + "-" + first 6 hex chars of the fingerprint.
export function sealId(title, fingerprint) {
  return `${slugify(title)}-${fingerprint.slice(7, 13)}`;
}

export const SEAL_ID_RE = /^[a-z0-9](?:[a-z0-9-]{0,79})-[0-9a-f]{6}$/;

export function makeSeal({ title, body, summary = "", tags = [] }) {
  if (!title || !body) throw new Error("A Seal requires 'title' and 'body'.");
  const fingerprint = sealFingerprint(title, body);
  return {
    id: sealId(title, fingerprint),
    title: String(title).trim(),
    summary: String(summary).trim(),
    tags: Array.isArray(tags) ? tags.map(String) : [],
    body: String(body),
    seal: { fingerprint, created: new Date().toISOString(), version: 1 },
  };
}

// Returns true iff the record's content still matches its sealed fingerprint.
export function verifySeal(rec) {
  return !!rec && !!rec.seal && sealFingerprint(rec.title, rec.body) === rec.seal.fingerprint;
}
