// SealStack — sealing primitive (the integrity layer). Zero deps. Node 18+.
// "Sealing" = fingerprinting content. The Card unit lives in card.mjs.
import { createHash } from "node:crypto";

export const SPEC_VERSION = "1.0";

// The one hash: sha256 over the JSON of a canonical object.
export function canonFingerprint(obj) {
  return "sha256:" + createHash("sha256").update(JSON.stringify(obj), "utf8").digest("hex");
}

// A Card's seal covers title + body ONLY.
export function sealFingerprint(title, body) {
  return canonFingerprint({
    title: String(title).trim(),
    body: String(body).replace(/\r\n/g, "\n").trim(),
  });
}

export function slugify(s) {
  return String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48) || "card";
}
