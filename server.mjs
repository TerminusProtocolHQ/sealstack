#!/usr/bin/env node
// SealStack MCP v0.6.1 — local-first server for storing/serving Cards. Zero deps. Node 18+.
// MCP over newline-delimited JSON-RPC on stdio. Reads/writes ONLY inside the data folder.
// No network. No shell. The host executes a Card's optional 'action'; this server never does.
import { createInterface } from "node:readline";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { sealFingerprint } from "./seal.mjs";
import { makeCard, CARD_ID_RE, FINGERPRINT_RE, verifyCard, hasUnsealedAction } from "./card.mjs";

const NAME = "sealstack", VERSION = "0.6.1", DEFAULT_PROTOCOL = "2024-11-05";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
// npx-safe default: a stable per-user dir, never the (possibly read-only) package location.
const DATA_DIR = process.env.SEALSTACK_DATA ? path.resolve(process.env.SEALSTACK_DATA) : path.join(os.homedir(), ".sealstack", "cards");
const HARD_DELETE = process.env.SEALSTACK_ALLOW_HARD_DELETE === "1";
const log = (...a) => process.stderr.write("[sealstack] " + a.join(" ") + "\n");

function ensureDir() { fs.mkdirSync(DATA_DIR, { recursive: true }); }
// Atomic, durable write: temp file + fsync + rename (no partial/corrupt JSON on crash).
function writeJsonAtomic(p, obj) {
  const data = JSON.stringify(obj, null, 2);
  const tmp = `${p}.tmp-${process.pid}-${Date.now()}`;
  const fd = fs.openSync(tmp, "w");
  try { fs.writeSync(fd, data); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
  fs.renameSync(tmp, p);
}
function trashDir() { const t = path.join(fs.realpathSync(DATA_DIR), ".trash"); fs.mkdirSync(t, { recursive: true }); return t; }
function softRemove(p, id) { const dest = path.join(trashDir(), `${Date.now()}-${id}.json`); fs.renameSync(p, dest); return dest; }

function isInside(base, t) { const r = path.relative(base, t); return r === "" || (!r.startsWith("..") && !path.isAbsolute(r)); }
function cardFilePath(id) {
  if (!CARD_ID_RE.test(String(id || ""))) throw new Error("Invalid Card id. Expected slug-title-abcdef format.");
  ensureDir(); const base = fs.realpathSync(DATA_DIR); const p = path.resolve(base, `${id}.json`);
  if (!isInside(base, p)) throw new Error("Invalid Card path: escapes data folder.");
  if (fs.existsSync(p)) {
    if (fs.lstatSync(p).isSymbolicLink()) throw new Error("Refusing to follow a symlink inside the vault.");
    if (!isInside(base, fs.realpathSync(p))) throw new Error("Invalid Card path: resolves outside data folder.");
  }
  return p;
}
// Classify a parsed record: INTACT | BROKEN (non-canonical) | MALFORMED (bad shape).
function isValidDateTime(s) { return typeof s === "string" && s.trim() === s && !Number.isNaN(Date.parse(s)); }
function basicCardShape(c) {
  return !!c && typeof c === "object" && !Array.isArray(c)
    && typeof c.id === "string" && CARD_ID_RE.test(c.id)
    && typeof c.title === "string" && c.title.trim() === c.title && !!c.title
    && typeof c.body === "string" && c.body.replace(/\r\n/g, "\n").trim() === c.body && !!c.body
    && !!c.seal && typeof c.seal === "object" && !Array.isArray(c.seal)
    && typeof c.seal.fingerprint === "string" && FINGERPRINT_RE.test(c.seal.fingerprint)
    && isValidDateTime(c.seal.created);
}
function cardStatus(c) {
  if (!basicCardShape(c)) return "MALFORMED";
  return verifyCard(c) ? "INTACT" : "BROKEN";
}
function readAllRecords() {
  ensureDir(); const base = fs.realpathSync(DATA_DIR); const out = [];
  for (const f of fs.readdirSync(base)) {
    if (!f.endsWith(".json")) continue; const full = path.join(base, f);
    try { if (!fs.lstatSync(full).isFile()) continue; out.push(JSON.parse(fs.readFileSync(full, "utf8"))); }
    catch { out.push({ __malformed: f }); }
  }
  return out;
}
function readCard(id) { const p = cardFilePath(id); if (!fs.existsSync(p)) return null; return JSON.parse(fs.readFileSync(p, "utf8")); }

function toolAddCard(a = {}) {
  const { title, body, summary = "", tags = [], action = null } = a;
  ensureDir(); const card = makeCard({ title, body, summary, tags, action });
  writeJsonAtomic(cardFilePath(card.id), card);
  let msg = `Sealed card "${card.title}".\n  id: ${card.id}\n  ${card.seal.fingerprint}`;
  if (hasUnsealedAction(card)) msg += `\n  note: 'action' stored but NOT covered by the seal (host-executed).`;
  return msg;
}
function toolListCards(a = {}) {
  const { tag } = a;
  let rows = readAllRecords().map((c) => c && c.__malformed ? { status: "MALFORMED", id: `(file ${c.__malformed})`, title: "(unparseable)", tags: [] } : { status: cardStatus(c), id: c.id, title: c.title, tags: c.tags || [] });
  if (tag) rows = rows.filter((r) => r.status !== "MALFORMED" && (r.tags || []).includes(tag));
  if (!rows.length) return tag ? `No Cards tagged "${tag}".` : "No Cards yet. Add one with add_card.";
  rows.sort((x, y) => String(x.title).localeCompare(String(y.title)));
  return `${rows.length} record(s) in ${DATA_DIR}:\n` + rows.map((r) => `- [${r.status}] ${r.id}  -  ${r.title}${r.tags?.length ? "  [" + r.tags.join(", ") + "]" : ""}`).join("\n");
}
function toolSearchCards(a = {}) {
  const { query } = a; if (!query) throw new Error("search_cards requires 'query'."); const q = String(query).toLowerCase();
  const hits = readAllRecords().filter((c) => c && !c.__malformed && typeof c.title === "string")
    .filter((c) => [c.title, c.summary, c.body, (c.tags || []).join(" ")].join(" ").toLowerCase().includes(q));
  return hits.length ? `${hits.length} match(es) for "${query}":\n` + hits.map((c) => `- [${cardStatus(c)}] ${c.id}  -  ${c.title}`).join("\n") : `No Cards match "${query}".`;
}
function toolGetCard(a = {}) { const { id } = a; if (!id) throw new Error("get_card requires 'id'."); const c = readCard(id); if (!c) throw new Error(`No Card with id "${id}".`); return JSON.stringify(c, null, 2); }
function toolVerifyCard(a = {}) {
  const { id } = a; if (!id) throw new Error("verify_card requires 'id'."); const c = readCard(id); if (!c) throw new Error(`No Card with id "${id}".`);
  if (!basicCardShape(c)) {
    const lines = [`MALFORMED - ${id}`, `  canonical record: no`];
    if (hasUnsealedAction(c)) lines.push(`  WARNING: carries an 'action' NOT covered by the seal (host-executed). "sealed" means CONTENT only.`);
    return lines.join("\n");
  }
  const fp = sealFingerprint(c.title, c.body); const contentOk = fp === c.seal.fingerprint; const canonical = verifyCard(c);
  const lines = [`${contentOk ? "CONTENT_INTACT" : "CONTENT_BROKEN"} - ${id}`, `  ${fp}`, `  canonical record: ${canonical ? "yes" : "no"}`];
  if (!contentOk) lines.push(`  stored: ${c.seal.fingerprint}`);
  if (hasUnsealedAction(c)) lines.push(`  WARNING: carries an 'action' NOT covered by the seal (host-executed). "sealed" means CONTENT only.`);
  return lines.join("\n");
}
function toolUpdateCard(a = {}) {
  const { id, title, body, summary, tags, action } = a; if (!id) throw new Error("update_card requires 'id'.");
  const cur = readCard(id); if (!cur) throw new Error(`No Card with id "${id}".`);
  const nTitle = title !== undefined ? title : cur.title; const nBody = body !== undefined ? body : cur.body;
  const nSummary = summary !== undefined ? summary : cur.summary || "";
  const nTags = tags !== undefined ? tags : cur.tags || [];
  const act = action !== undefined ? action : cur.action;
  const rec = makeCard({ title: nTitle, body: nBody, summary: nSummary, tags: nTags, action: act });
  const newId = rec.id; const fp = rec.seal.fingerprint;
  if (newId === id && cur.seal && isValidDateTime(cur.seal.created)) rec.seal.created = cur.seal.created;
  writeJsonAtomic(cardFilePath(newId), rec);
  let msg = `Updated "${rec.title}".\n  id: ${newId}\n  ${fp}`;
  if (newId !== id) { const op = cardFilePath(id); if (fs.existsSync(op)) softRemove(op, id); msg += `\n  content changed -> new id; prior version moved to .trash/`; }
  if (hasUnsealedAction(rec)) msg += `\n  note: 'action' stored but NOT covered by the seal.`;
  return msg;
}
function toolDeleteCard(a = {}) {
  const { id, confirm } = a; if (!id) throw new Error("delete_card requires 'id'."); const p = cardFilePath(id); if (!fs.existsSync(p)) throw new Error(`No Card with id "${id}".`);
  if (confirm !== id) throw new Error(`Refusing to delete: pass "confirm" equal to the id ("${id}").`);
  if (HARD_DELETE) { fs.rmSync(p); return `Hard-deleted Card ${id} (permanent; SEALSTACK_ALLOW_HARD_DELETE=1).`; }
  softRemove(p, id); return `Soft-deleted Card ${id} -> .trash/. Set SEALSTACK_ALLOW_HARD_DELETE=1 for permanent deletion.`;
}
function toolBuildContextPacket(a = {}) {
  const { ids } = a; if (!Array.isArray(ids) || !ids.length) throw new Error("build_context_packet requires 'ids' (array).");
  return ids.map((id) => { const c = readCard(id); return c ? `## ${c.title}  [${id}]\n${c.summary ? c.summary + "\n\n" : ""}${c.body}` : `## (missing: ${id})`; }).join("\n\n---\n\n");
}

const TOOLS = [
  { name: "add_card", description: "Add (seal) a new reusable Card. Optional 'action' seam is stored but NOT sealed (host-executed).", inputSchema: { type: "object", properties: { title: { type: "string" }, body: { type: "string", description: "Prose, instructions, or code." }, summary: { type: "string" }, tags: { type: "array", items: { type: "string" } }, action: { type: "object" } }, required: ["title", "body"] }, run: toolAddCard },
  { name: "list_cards", description: "List records with status [INTACT|BROKEN|MALFORMED], optional tag filter.", inputSchema: { type: "object", properties: { tag: { type: "string" } } }, run: toolListCards },
  { name: "search_cards", description: "Keyword search across Card title/summary/tags/body (well-formed only).", inputSchema: { type: "object", properties: { query: { type: "string" } }, required: ["query"] }, run: toolSearchCards },
  { name: "get_card", description: "Return one full Card by id.", inputSchema: { type: "object", properties: { id: { type: "string" } }, required: ["id"] }, run: toolGetCard },
  { name: "verify_card", description: "Report CONTENT_INTACT/CONTENT_BROKEN, whether the record is canonical, and warn if it carries an unsealed action.", inputSchema: { type: "object", properties: { id: { type: "string" } }, required: ["id"] }, run: toolVerifyCard },
  { name: "update_card", description: "Update a Card by id and re-seal. Content edits mint a new id; the prior version is moved to .trash/.", inputSchema: { type: "object", properties: { id: { type: "string" }, title: { type: "string" }, body: { type: "string" }, summary: { type: "string" }, tags: { type: "array", items: { type: "string" } }, action: { type: "object" } }, required: ["id"] }, run: toolUpdateCard },
  { name: "delete_card", description: "Delete a Card. Requires 'confirm' equal to the id. Soft-deletes to .trash/ unless SEALSTACK_ALLOW_HARD_DELETE=1.", inputSchema: { type: "object", properties: { id: { type: "string" }, confirm: { type: "string", description: "Must equal the id." } }, required: ["id", "confirm"] }, run: toolDeleteCard },
  { name: "build_context_packet", description: "Assemble selected Cards (by id) into one text packet for a model's context.", inputSchema: { type: "object", properties: { ids: { type: "array", items: { type: "string" } } }, required: ["ids"] }, run: toolBuildContextPacket },
];

function send(m) { process.stdout.write(JSON.stringify(m) + "\n"); }
function reply(id, result) { send({ jsonrpc: "2.0", id, result }); }
function replyError(id, code, message) { send({ jsonrpc: "2.0", id, error: { code, message } }); }
function handle(msg) {
  const { id, method, params } = msg; const isReq = Object.prototype.hasOwnProperty.call(msg, "id");
  switch (method) {
    case "initialize": return reply(id, { protocolVersion: (params && params.protocolVersion) || DEFAULT_PROTOCOL, capabilities: { tools: {} }, serverInfo: { name: NAME, version: VERSION } });
    case "notifications/initialized": case "initialized": return;
    case "ping": return reply(id, {});
    case "tools/list": return reply(id, { tools: TOOLS.map(({ name, description, inputSchema }) => ({ name, description, inputSchema })) });
    case "tools/call": { const t = TOOLS.find((x) => x.name === (params && params.name)); if (!t) return replyError(id, -32602, `Unknown tool: ${params && params.name}`);
      try { return reply(id, { content: [{ type: "text", text: t.run(params.arguments || {}) }] }); } catch (e) { return reply(id, { content: [{ type: "text", text: "Error: " + (e?.message || String(e)) }], isError: true }); } }
    case "resources/list": return reply(id, { resources: [] });
    case "resources/templates/list": return reply(id, { resourceTemplates: [] });
    case "prompts/list": return reply(id, { prompts: [] });
    default: if (isReq) return replyError(id, -32601, `Method not found: ${method}`); return;
  }
}
function main() {
  ensureDir(); log(`SealStack MCP ${VERSION} - data dir: ${DATA_DIR}`);
  const rl = createInterface({ input: process.stdin });
  rl.on("line", (line) => { const s = line.trim(); if (!s) return; let msg; try { msg = JSON.parse(s); } catch { return log("dropped non-JSON line"); } try { handle(msg); } catch (e) { log("handler error", String(e)); } });
  rl.on("close", () => process.exit(0));
}
main();
