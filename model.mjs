// SealStack — workflow tiers above the Card. Zero deps; reuses seal.mjs hash.
//   Card -> Stack -> Deck -> Run. Each references the tier below by id and seals itself.
// Defines/validates artifacts; does NOT execute anything.
import { canonFingerprint, slugify } from "./seal.mjs";

const FINGERPRINT_RE = /^sha256:[0-9a-f]{64}$/;
const RECORD_ID_RE = /^[a-z0-9](?:[a-z0-9-]{0,79})-[0-9a-f]{6}$/;
const RUN_ID_RE = /^run-[0-9a-f]{10}$/;
function idFrom(title, fp) { return `${slugify(title)}-${fp.slice(7, 13)}`; }
function isPlainObject(x) { return !!x && typeof x === "object" && !Array.isArray(x); }
function isValidDateTime(s) { return typeof s === "string" && s.trim() === s && !Number.isNaN(Date.parse(s)); }
function cleanTitle(title, noun) {
  if (typeof title !== "string") throw new Error(`A ${noun} requires 'title' to be a string.`);
  const out = title.trim();
  if (!out) throw new Error(`A ${noun} requires a non-empty normalized 'title'.`);
  return out;
}
function cleanIdList(xs, noun, field) {
  if (!Array.isArray(xs) || xs.length === 0) throw new Error(`A ${noun} requires '${field}' with >=1 id.`);
  const out = xs.map((x) => {
    if (typeof x !== "string") throw new Error(`A ${noun} '${field}' entry must be a string.`);
    const id = x.trim();
    if (!id) throw new Error(`A ${noun} '${field}' entry cannot be empty.`);
    return id;
  });
  return out;
}
function validSeal(seal) {
  return isPlainObject(seal)
    && typeof seal.fingerprint === "string" && FINGERPRINT_RE.test(seal.fingerprint)
    && seal.version === 1
    && isValidDateTime(seal.created);
}
function validIdList(xs) {
  return Array.isArray(xs) && xs.length > 0 && xs.every((x) => typeof x === "string" && x.trim() === x && RECORD_ID_RE.test(x));
}

export function makeStack({ title, summary = "", cards = [] }) {
  const nTitle = cleanTitle(title, "Stack");
  const members = cleanIdList(cards, "Stack", "cards");
  const fp = canonFingerprint({ kind: "stack", title: nTitle, cards: members });
  return { id: idFrom(nTitle, fp), kind: "stack", title: nTitle,
    summary: String(summary).trim(), cards: members,
    seal: { fingerprint: fp, created: new Date().toISOString(), version: 1 } };
}
export function makeDeck({ title, summary = "", stacks = [] }) {
  const nTitle = cleanTitle(title, "Deck");
  const members = cleanIdList(stacks, "Deck", "stacks");
  const fp = canonFingerprint({ kind: "deck", title: nTitle, stacks: members });
  return { id: idFrom(nTitle, fp), kind: "deck", title: nTitle,
    summary: String(summary).trim(), stacks: members,
    seal: { fingerprint: fp, created: new Date().toISOString(), version: 1 } };
}
export function makeRun({ deck, deckFingerprint = "", model = "", input = "", outcome = "", status = "recorded", startedAt = null, finishedAt = "" }) {
  if (typeof deck !== "string" || !deck.trim()) throw new Error("A Run requires a non-empty string 'deck' id.");
  const started = startedAt == null ? new Date().toISOString() : String(startedAt).trim();
  if (!isValidDateTime(started)) throw new Error("A Run requires a valid date-time 'startedAt'.");
  const finished = String(finishedAt).trim();
  if (finished && !isValidDateTime(finished)) throw new Error("A Run 'finishedAt' must be empty or a valid date-time.");
  const statusText = String(status).trim();
  if (!statusText) throw new Error("A Run requires a non-empty 'status'.");
  const payload = { kind: "run", deck: deck.trim(), deckFingerprint: String(deckFingerprint).trim(),
    model: String(model), input: String(input), outcome: String(outcome), status: statusText,
    startedAt: started, finishedAt: finished };
  const fp = canonFingerprint(payload);
  return { id: `run-${fp.slice(7, 17)}`, ...payload,
    seal: { fingerprint: fp, created: new Date().toISOString(), version: 1 } };
}

export function canonicalOf(rec) {
  if (rec.kind === "stack") return { kind: "stack", title: rec.title, cards: rec.cards };
  if (rec.kind === "deck") return { kind: "deck", title: rec.title, stacks: rec.stacks };
  if (rec.kind === "run") return { kind: "run", deck: rec.deck, deckFingerprint: rec.deckFingerprint,
    model: rec.model, input: rec.input, outcome: rec.outcome, status: rec.status,
    startedAt: rec.startedAt, finishedAt: rec.finishedAt };
  return null;
}

export function validRecordShape(rec) {
  if (!isPlainObject(rec) || !validSeal(rec.seal)) return false;
  if (rec.kind === "stack") {
    return typeof rec.id === "string" && RECORD_ID_RE.test(rec.id)
      && typeof rec.title === "string" && rec.title.trim() === rec.title && !!rec.title
      && validIdList(rec.cards);
  }
  if (rec.kind === "deck") {
    return typeof rec.id === "string" && RECORD_ID_RE.test(rec.id)
      && typeof rec.title === "string" && rec.title.trim() === rec.title && !!rec.title
      && validIdList(rec.stacks);
  }
  if (rec.kind === "run") {
    return typeof rec.id === "string" && RUN_ID_RE.test(rec.id)
      && typeof rec.deck === "string" && rec.deck.trim() === rec.deck && RECORD_ID_RE.test(rec.deck)
      && (typeof rec.deckFingerprint === "string" && (rec.deckFingerprint === "" || FINGERPRINT_RE.test(rec.deckFingerprint)))
      && typeof rec.model === "string"
      && typeof rec.input === "string"
      && typeof rec.outcome === "string"
      && typeof rec.status === "string" && rec.status.trim() === rec.status && !!rec.status
      && isValidDateTime(rec.startedAt)
      && typeof rec.finishedAt === "string" && (rec.finishedAt === "" || isValidDateTime(rec.finishedAt));
  }
  return false;
}

// Canonical verification incl. the derived id (per kind: run uses run-<10 hex>).
export function verifyRecord(rec) {
  if (!validRecordShape(rec)) return false;
  const c = canonicalOf(rec);
  if (!c) return false;
  const fp = canonFingerprint(c);
  if (fp !== rec.seal.fingerprint) return false;
  const expectId = rec.kind === "run" ? `run-${fp.slice(7, 17)}` : idFrom(rec.title, fp);
  return rec.id === expectId;
}

export function resolveStack(stack, cardsById = {}) {
  return { ...stack, cards: stack.cards.map((id) => cardsById[id] || { id, missing: true }) };
}
export function resolveDeck(deck, stacksById = {}, cardsById = {}) {
  return { ...deck, stacks: deck.stacks.map((id) => {
    const st = stacksById[id];
    return st ? resolveStack(st, cardsById) : { id, missing: true };
  }) };
}
