#!/usr/bin/env node
// SealStack MCP v0.1.1 — local-first server for storing/serving Seals.
// A "Seal" is one reusable, fingerprinted workflow unit. Zero deps. Node 18+.
// MCP over newline-delimited JSON-RPC on stdio.
// Boundary: reads/writes ONLY inside the local data folder. No network. No shell.
// Hardened: every id-addressed file access is validated by id-shape + lexical
// containment + symlink/real-path containment (reads AND writes).

import { createInterface } from "node:readline";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const NAME = "sealstack";
const VERSION = "0.1.1";
const DEFAULT_PROTOCOL = "2024-11-05";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = process.env.SEALSTACK_DATA
  ? path.resolve(process.env.SEALSTACK_DATA)
  : path.join(__dirname, "seals");

const log = (...a) => process.stderr.write("[sealstack] " + a.join(" ") + "\n");

// ---- storage helpers --------------------------------------------------------
function ensureDir() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}
function slugify(s) {
  return String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48) || "seal";
}
function fingerprint(title, body) {
  const canon = JSON.stringify({
    title: String(title).trim(),
    body: String(body).replace(/\r\n/g, "\n").trim(),
  });
  return "sha256:" + createHash("sha256").update(canon, "utf8").digest("hex");
}

// ---- safe path resolution (id args come from the model; trust nothing) ------
function assertSafeSealId(id) {
  const s = String(id || "");
  if (!/^[a-z0-9](?:[a-z0-9-]{0,79})-[0-9a-f]{6}$/.test(s)) {
    throw new Error("Invalid Seal id. Expected slug-title-abcdef format.");
  }
  return s;
}
function isInside(base, target) {
  const rel = path.relative(base, target);
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
}
function sealFilePath(id) {
  const safeId = assertSafeSealId(id);
  ensureDir();
  const base = fs.realpathSync(DATA_DIR);
  const p = path.resolve(base, `${safeId}.json`);
  if (!isInside(base, p)) throw new Error("Invalid Seal path: escapes data folder.");
  if (fs.existsSync(p)) {
    if (fs.lstatSync(p).isSymbolicLink()) throw new Error("Refusing to follow a symlink inside the vault.");
    if (!isInside(base, fs.realpathSync(p))) throw new Error("Invalid Seal path: resolves outside data folder.");
  }
  return p;
}
function readAllSeals() {
  ensureDir();
  const base = fs.realpathSync(DATA_DIR);
  const out = [];
  for (const f of fs.readdirSync(base)) {
    if (!f.endsWith(".json")) continue;
    const full = path.join(base, f);
    try {
      if (!fs.lstatSync(full).isFile()) continue; // skip symlinks/non-files
      const rec = JSON.parse(fs.readFileSync(full, "utf8"));
      if (rec && rec.id) out.push(rec);
    } catch (e) {
      log("skip unreadable file", f, String(e));
    }
  }
  return out;
}
function readSeal(id) {
  const p = sealFilePath(id);
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

// ---- tools ------------------------------------------------------------------
function toolAddSeal(args = {}) {
  const { title, body, summary = "", tags = [] } = args;
  if (!title || !body) throw new Error("add_seal requires 'title' and 'body'.");
  ensureDir();
  const fp = fingerprint(title, body);
  const id = `${slugify(title)}-${fp.slice(7, 13)}`;
  const rec = {
    id,
    title: String(title).trim(),
    summary: String(summary).trim(),
    tags: Array.isArray(tags) ? tags.map(String) : [],
    body: String(body),
    seal: { fingerprint: fp, created: new Date().toISOString(), version: 1 },
  };
  const dest = sealFilePath(id); // writes use the same guard as reads
  fs.writeFileSync(dest, JSON.stringify(rec, null, 2));
  return `Sealed "${rec.title}".\n  id: ${id}\n  ${fp}\n  saved -> ${dest}`;
}
function toolListSeals(args = {}) {
  const { tag } = args;
  let seals = readAllSeals();
  if (tag) seals = seals.filter((s) => (s.tags || []).includes(tag));
  if (!seals.length) return tag ? `No Seals tagged "${tag}".` : "No Seals yet. Add one with add_seal.";
  seals.sort((a, b) => a.title.localeCompare(b.title));
  const lines = seals.map((s) => `- ${s.id}  -  ${s.title}${s.tags?.length ? "  [" + s.tags.join(", ") + "]" : ""}`);
  return `${seals.length} Seal(s) in ${DATA_DIR}:\n${lines.join("\n")}`;
}
function toolSearchSeals(args = {}) {
  const { query } = args;
  if (!query) throw new Error("search_seals requires 'query'.");
  const q = String(query).toLowerCase();
  const hits = readAllSeals().filter((s) =>
    [s.title, s.summary, s.body, (s.tags || []).join(" ")].join(" ").toLowerCase().includes(q)
  );
  if (!hits.length) return `No Seals match "${query}".`;
  return `${hits.length} match(es) for "${query}":\n` + hits.map((s) => `- ${s.id}  -  ${s.title}`).join("\n");
}
function toolGetSeal(args = {}) {
  const { id } = args;
  if (!id) throw new Error("get_seal requires 'id'.");
  const rec = readSeal(id);
  if (!rec) throw new Error(`No Seal with id "${id}".`);
  return JSON.stringify(rec, null, 2);
}
function toolVerifySeal(args = {}) {
  const { id } = args;
  if (!id) throw new Error("verify_seal requires 'id'.");
  const rec = readSeal(id);
  if (!rec) throw new Error(`No Seal with id "${id}".`);
  const now = fingerprint(rec.title, rec.body);
  return now === rec.seal?.fingerprint
    ? `INTACT - ${id}\n  ${now}\n  Content matches its seal.`
    : `BROKEN - ${id}\n  stored:  ${rec.seal?.fingerprint}\n  current: ${now}\n  Content has changed since it was sealed.`;
}
function toolBuildContextPacket(args = {}) {
  const { ids } = args;
  if (!Array.isArray(ids) || !ids.length) throw new Error("build_context_packet requires 'ids' (array).");
  return ids
    .map((id) => {
      const rec = readSeal(id);
      if (!rec) return `## (missing: ${id})`;
      return `## ${rec.title}  [${id}]\n${rec.summary ? rec.summary + "\n\n" : ""}${rec.body}`;
    })
    .join("\n\n---\n\n");
}

// ---- registry ---------------------------------------------------------------
const TOOLS = [
  { name: "add_seal", description: "Add (seal) a new reusable workflow unit. Fingerprints it so it is tamper-evident.",
    inputSchema: { type: "object", properties: {
      title: { type: "string", description: "Short name of the Seal." },
      body: { type: "string", description: "What to do / use / produce / when to stop / what to record." },
      summary: { type: "string", description: "Optional one-line summary." },
      tags: { type: "array", items: { type: "string" }, description: "Optional tags." },
    }, required: ["title", "body"] }, run: toolAddSeal },
  { name: "list_seals", description: "List all Seals in the local vault, optionally filtered by tag.",
    inputSchema: { type: "object", properties: { tag: { type: "string", description: "Optional tag filter." } } }, run: toolListSeals },
  { name: "search_seals", description: "Keyword search across Seal titles, summaries, tags, and bodies.",
    inputSchema: { type: "object", properties: { query: { type: "string" } }, required: ["query"] }, run: toolSearchSeals },
  { name: "get_seal", description: "Return one full Seal (including its fingerprint) by id.",
    inputSchema: { type: "object", properties: { id: { type: "string" } }, required: ["id"] }, run: toolGetSeal },
  { name: "verify_seal", description: "Recompute a Seal's fingerprint and report whether content still matches its seal.",
    inputSchema: { type: "object", properties: { id: { type: "string" } }, required: ["id"] }, run: toolVerifySeal },
  { name: "build_context_packet", description: "Assemble selected Seals (by id) into one text packet for an agent's context.",
    inputSchema: { type: "object", properties: { ids: { type: "array", items: { type: "string" } } }, required: ["ids"] }, run: toolBuildContextPacket },
];

// ---- JSON-RPC / MCP plumbing ------------------------------------------------
function send(msg) { process.stdout.write(JSON.stringify(msg) + "\n"); }
function reply(id, result) { send({ jsonrpc: "2.0", id, result }); }
function replyError(id, code, message) { send({ jsonrpc: "2.0", id, error: { code, message } }); }

function handle(msg) {
  const { id, method, params } = msg;
  const isRequest = Object.prototype.hasOwnProperty.call(msg, "id");
  switch (method) {
    case "initialize":
      return reply(id, {
        protocolVersion: (params && params.protocolVersion) || DEFAULT_PROTOCOL,
        capabilities: { tools: {} },
        serverInfo: { name: NAME, version: VERSION },
      });
    case "notifications/initialized":
    case "initialized":
      return;
    case "ping":
      return reply(id, {});
    case "tools/list":
      return reply(id, { tools: TOOLS.map(({ name, description, inputSchema }) => ({ name, description, inputSchema })) });
    case "tools/call": {
      const tool = TOOLS.find((t) => t.name === (params && params.name));
      if (!tool) return replyError(id, -32602, `Unknown tool: ${params && params.name}`);
      try {
        return reply(id, { content: [{ type: "text", text: tool.run(params.arguments || {}) }] });
      } catch (e) {
        return reply(id, { content: [{ type: "text", text: "Error: " + (e?.message || String(e)) }], isError: true });
      }
    }
    case "resources/list":
      return reply(id, { resources: [] });
    case "resources/templates/list":
      return reply(id, { resourceTemplates: [] });
    case "prompts/list":
      return reply(id, { prompts: [] });
    default:
      if (isRequest) return replyError(id, -32601, `Method not found: ${method}`);
      return;
  }
}

function main() {
  ensureDir();
  log(`SealStack MCP ${VERSION} - data dir: ${DATA_DIR}`);
  const rl = createInterface({ input: process.stdin });
  rl.on("line", (line) => {
    const s = line.trim();
    if (!s) return;
    let msg;
    try { msg = JSON.parse(s); } catch { return log("dropped non-JSON line"); }
    try { handle(msg); } catch (e) { log("handler error", String(e)); }
  });
  rl.on("close", () => process.exit(0));
}

main();
