# SealStack — Card Spec v1.0

**Status: stable.** Single source of truth for what a *Card* is. Any tool that creates,
reads, or verifies Cards — the MCP server, the SKILL.md bridge, anything new — MUST follow
this. Reference implementation: `card.mjs` (+ `seal.mjs` for the hash). *("SealStack" is a
working brand name; the card system below is the canonical thing.)*

> **One rule:** the seal (fingerprint) covers **title + body only**. Everything else —
> tags, summary, action, meta — is additive and never changes the fingerprint. That is
> what lets a Card travel between hosts unchanged.

## 1. What a Card is
One reusable, sealed unit — a small move (*what to do, use, produce, when to stop, what to
record*). Plain JSON, local-first, tamper-evident. There is exactly one unit type: the Card.

## 2. Canonical record
| Field | Type | Req | Notes |
|---|---|---|---|
| `id` | string | yes (derived) | `slug(title)-<6 hex>`. Do not hand-author. |
| `title` | string | yes | Part of the seal. Must be normalized, trimmed, and non-empty. |
| `summary` | string | no | The routing/trigger line. Not sealed. |
| `tags` | string[] | no | Not sealed. |
| `body` | string | yes | The move. Opaque text — prose, instructions, **or code**. Part of the seal. CRLF-normalized, trimmed, and non-empty. |
| `seal` | object | yes | `{ fingerprint, created, version:1 }`. |
| `action` | object | no | **Optional seam**, host-executed (e.g. `{tool:"run_js",asset:"index.html"}`). Not sealed. |

## 3. The seal (fingerprint)
1. `title` → trim. 2. `body` → CRLF→LF, then trim. 3. `canon = JSON.stringify({title, body})`
(that key order). 4. `fingerprint = "sha256:" + hex(sha256(utf8(canon)))`. Only title+body.

## 4. The id
`id = slug(title) + "-" + fingerprint_hex[0:6]`; slug = lowercase, non-`[a-z0-9]`→`-`, trim
`-`, cut to 48, fallback `card`. Validate before any path use: `^[a-z0-9](?:[a-z0-9-]{0,79})-[0-9a-f]{6}$`.

## 5. Storage
One Card per file `<id>.json` in `cards/`; the index is derived by scanning. Tiers live in
`stacks/`, `decks/`, `runs/`. Resolve `<id>.json` only inside the vault (validate id, reject
escapes, refuse symlinks).

## 6. Conformance
Emitter MUST: reject non-string or whitespace-only `title`/`body`, normalize them per §3, seal per §3, set `created`/`version:1`, and derive `id` per §4. Consumer MUST: validate shape before hashing, recompute and treat mismatch as BROKEN, and validate `id`. Both MUST preserve unknown fields and keep them out of the fingerprint.

## 7. Extending without sprawl
Domain data goes top-level under `meta` (e.g. `meta.ixcore_*`); the `action` seam carries
host-executed behavior. Neither touches the seal. One core, additive everything-else, one hash.

## 8. Golden vector
`title "Temp test", body "hello"` → `{"title":"Temp test","body":"hello"}` →
`sha256:a51cc23f48b515700c57f4794c5d6946c8e4543b3d4f4df191c4d78a27c364f5` → id `temp-test-a51cc2`.

## 9. Workflow tiers
| Tier | Shape | Seal covers |
|---|---|---|
| **Stack** | `{id,kind:"stack",title,cards:[cardId…],seal}` | `{kind,title,cards}` |
| **Deck** | `{id,kind:"deck",title,stacks:[stackId…],seal}` | `{kind,title,stacks}` |
| **Run** | `{id:"run-…",kind:"run",deck,deckFingerprint,…,seal}` | the run payload |
A **sealed Run is its own Receipt**. SealStack defines/verifies these; it does **not** execute
them — the host runs actions.

## 10. Delivery adapters
A Card delivers to any host: **context-packet** (raw body, cheapest, for bare models),
**SKILL.md** (`skill.mjs`, for hosts with a skill system), **MCP tool** (`server.mjs`). A
"skill" is one adapter, never the Card's identity. The `action` seam, when a host supports it
(run_js / function-calling), lets a Card *act* — the host executes, not SealStack.

## 11. Reference
`seal.mjs` (hash), `card.mjs` (`makeCard`/`verifyCard`), `model.mjs` (`makeStack`/`makeDeck`/
`makeRun`/`resolveDeck`/`verifyRecord`), `skill.mjs` (`cardToSkillMd`/`stackToSkillMd`/`deckToSkillMd`).

## 12. Verification & safety (v0.6.1)
- `verifyCard` / `verifyRecord` require a **canonical** record: schema-critical shape, non-empty normalized strings, id shape, fingerprint shape, valid seal timestamp, `version===1`, recomputed fingerprint match, **and `id === derived(title, fingerprint)`** (Runs use `run-<10 hex>`). A wrong, malformed, or forged id fails.
- The verifier reports **`CONTENT_INTACT`**, not `INTACT`: it proves *content* (title+body) is sealed and separately reports whether the record is canonical. A Card carrying an `action` is **flagged** — the `action` seam is host-executed and **not** covered by the content seal. "Sealed" means content only, until an execution-manifest seal exists.
- `delete_card` requires `confirm === id` and **soft-deletes to `.trash/`**; permanent deletion only with `SEALSTACK_ALLOW_HARD_DELETE=1`. `update_card` moves superseded versions to `.trash/`.
- Card writes are **atomic** (temp + fsync + rename). Default data dir is **`~/.sealstack/cards`** (override with `SEALSTACK_DATA`). `list`/`search` tag each record `INTACT | BROKEN | MALFORMED`.
- Schemas: `schema/card.schema.json` + `schema/{stack,deck,run}.schema.json`.
