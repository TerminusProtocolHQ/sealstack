// SealStack — the Card: one reusable, sealed unit. Zero deps; uses seal.mjs.
// A Card's body is opaque text (prose, instructions, or code). "seal" = its stamp.
import { sealFingerprint, slugify } from "./seal.mjs";

export const CARD_ID_RE = /^[a-z0-9](?:[a-z0-9-]{0,79})-[0-9a-f]{6}$/;
export const FINGERPRINT_RE = /^sha256:[0-9a-f]{64}$/;

function normalizeTitle(title) {
  if (typeof title !== "string") throw new Error("A Card requires 'title' to be a string.");
  const out = title.trim();
  if (!out) throw new Error("A Card requires a non-empty normalized 'title'.");
  return out;
}
function normalizeBody(body) {
  if (typeof body !== "string") throw new Error("A Card requires 'body' to be a string.");
  const out = body.replace(/\r\n/g, "\n").trim();
  if (!out) throw new Error("A Card requires a non-empty normalized 'body'.");
  return out;
}
function isValidDateTime(s) {
  return typeof s === "string" && s.trim() === s && !Number.isNaN(Date.parse(s));
}

export function cardId(title, fingerprint) {
  return `${slugify(title)}-${fingerprint.slice(7, 13)}`;
}

export function makeCard({ title, body, summary = "", tags = [], action = null }) {
  const nTitle = normalizeTitle(title);
  const nBody = normalizeBody(body);
  const fingerprint = sealFingerprint(nTitle, nBody);
  const card = {
    id: cardId(nTitle, fingerprint),
    title: nTitle,
    summary: String(summary).trim(),
    tags: Array.isArray(tags) ? tags.map(String) : [],
    body: nBody,
    seal: { fingerprint, created: new Date().toISOString(), version: 1 },
  };
  // Optional action seam (host-executed, e.g. run_js). Additive; NOT in the seal.
  if (action != null) card.action = action;
  return card;
}

// True if the record carries a host-executable action that the content seal does NOT cover.
export function hasUnsealedAction(rec) { return !!rec && rec.action != null; }

export function validCardShape(rec) {
  if (!rec || typeof rec !== "object" || Array.isArray(rec)) return false;
  if (!rec.seal || typeof rec.seal !== "object" || Array.isArray(rec.seal)) return false;
  if (typeof rec.id !== "string" || !CARD_ID_RE.test(rec.id)) return false;
  if (typeof rec.title !== "string" || typeof rec.body !== "string") return false;
  if (rec.title !== rec.title.trim() || !rec.title) return false;
  const nBody = rec.body.replace(/\r\n/g, "\n").trim();
  if (rec.body !== nBody || !nBody) return false;
  if (typeof rec.seal.fingerprint !== "string" || !FINGERPRINT_RE.test(rec.seal.fingerprint)) return false;
  if (rec.seal.version !== 1) return false;
  if (!isValidDateTime(rec.seal.created)) return false;
  return true;
}

// Full canonical verification: schema-critical shape + fingerprint shape + version + content match
// + the id is the one DERIVED from (title, fingerprint). Proves a record is canonical,
// not merely that some title/body pair matches some stored fingerprint.
export function verifyCard(rec) {
  if (!validCardShape(rec)) return false;
  const fp = sealFingerprint(rec.title, rec.body);
  if (fp !== rec.seal.fingerprint) return false;
  return rec.id === cardId(rec.title, fp);
}
