# SealStack — Seal Spec v1.0

**Status: stable.** This is the single source of truth for what a *Seal* is. Any
tool that creates, reads, or verifies Seals — the MCP server, the Index, or
anything new you build — MUST follow this document so Seals stay portable and
sprawl stays contained. The reference implementation is `seal.mjs`; import it
rather than re-deriving the hash.

> **One rule above all:** the fingerprint covers **title + body only**. Everything
> else is metadata. That is what lets a Seal travel between tools unchanged.

---

## 1. What a Seal is

A **Seal** is one reusable, fingerprinted workflow unit — a small, self-contained
move (*what to do, what to use, what to produce, when to stop, what to record*).
It is plain JSON. It is local-first. Its fingerprint makes it tamper-evident.

There is exactly **one** unit type. Do not invent parallel "cards", "units", or
"blocks". If it is a reusable move, it is a Seal.

## 2. Canonical record

```json
{
  "id": "summarize-a-diff-637455",
  "title": "Summarize a diff",
  "summary": "Turn a code diff into a tight review summary.",
  "tags": ["review"],
  "body": "Do: … Produce: … Stop when: … Record: …",
  "seal": { "fingerprint": "sha256:6374…", "created": "2026-06-07T03:36:04.843Z", "version": 1 }
}
```

| Field | Type | Required | Notes |
|---|---|---|---|
| `id` | string | yes (derived) | `slug(title)-<6 hex>` — see §4. Do not hand-author. |
| `title` | string | yes | Short name. Part of the fingerprint. |
| `summary` | string | no | One line. **Not** fingerprinted. |
| `tags` | string[] | no | Free-form labels. **Not** fingerprinted. |
| `body` | string | yes | The move itself. Part of the fingerprint. |
| `seal` | object | yes | `{ fingerprint, created, version }` — see §3. |
| `seal.fingerprint` | string | yes | `sha256:` + 64 hex. |
| `seal.created` | string | yes | ISO-8601 UTC timestamp. |
| `seal.version` | integer | yes | Seal-format version. Currently `1`. |

`body` is opaque text. The Goal / Do / Produce / Stop-when / Record shape is a
**recommended convention**, not enforced.

## 3. The fingerprint (the seal)

Deterministic, language-neutral:

1. **title** → trim leading/trailing whitespace.
2. **body** → replace every CRLF (`\r\n`) with LF (`\n`), then trim.
3. **canon** → a JSON object with EXACTLY the keys `title` then `body`, serialized
   the way `JSON.stringify` does (compact, no extra spaces, standard JSON string
   escaping, UTF-8).
4. **fingerprint** → `"sha256:" + lowercase_hex( sha256( utf8(canon) ) )`.

Reference (`seal.mjs`):

```js
const canon = JSON.stringify({ title: String(title).trim(),
                               body: String(body).replace(/\r\n/g,"\n").trim() });
return "sha256:" + sha256_hex(canon);
```

Only `title` and `body` are hashed. Adding/changing `summary`, `tags`, or any
extension field never changes the fingerprint.

## 4. The id

`id = slug(title) + "-" + fingerprint_hex[0:6]`

`slug(s)`: lowercase → replace each run of non-`[a-z0-9]` with `-` → strip leading
/trailing `-` → truncate to 48 chars → fall back to `"seal"` if empty.

Valid id shape (consumers MUST validate before using an id in a file path):

```
^[a-z0-9](?:[a-z0-9-]{0,79})-[0-9a-f]{6}$
```

## 5. Storage convention

- One Seal per file, named `<id>.json`, in a flat folder you control.
- The folder location is the "vault" (the MCP reads it from `SEALSTACK_DATA`).
- The index is **derived** by scanning the folder — there is no hand-maintained
  `index.json`. Any `index.json` is ignored.
- Consumers MUST resolve `<id>.json` only inside the vault: validate the id (§4),
  reject paths that escape the folder, and refuse symlinks. (See `server.mjs`.)

## 6. Conformance

**An emitter MUST:** compute `fingerprint` per §3; set `seal.created` (ISO-8601 UTC)
and `seal.version = 1`; derive `id` per §4; write one `<id>.json` per Seal.

**A consumer MUST:** recompute the fingerprint from `title`+`body` and treat any
mismatch as **BROKEN**; validate `id` against the §4 regex before path use.

**Both MUST:** preserve unknown top-level fields on round-trip, and MUST NOT let
them affect the fingerprint.

## 7. Extending without sprawl

You will want domain-specific data (the thing you're building needs more). Add it
**at the top level** (or under a single `meta` object). Because the fingerprint is
title+body only, extra fields are always safe and portable:

```json
{
  "id": "...", "title": "...", "body": "...", "seal": { ... },
  "meta": { "owner": "jacobs", "project": "ixcore", "stage": "draft" }
}
```

Rules: never put extension data inside `seal`; never rename core fields; if a field
is app-specific, namespace it (e.g. `meta.ixcore_*`). A plain SealStack consumer
ignores `meta` and still verifies the Seal. That is the whole anti-sprawl contract:
**one core format, additive metadata, one hash.**

## 8. Golden test vectors

Use these to confirm any reimplementation matches byte-for-byte.

| title | body | canonical string | fingerprint | id |
|---|---|---|---|---|
| `Temp test` | `hello` | `{"title":"Temp test","body":"hello"}` | `sha256:a51cc23f48b515700c57f4794c5d6946c8e4543b3d4f4df191c4d78a27c364f5` | `temp-test-a51cc2` |

The two shipped Seals (`seals/*.json`) are also conformance fixtures: recompute and
you MUST get `sha256:d96c13…` and `sha256:637455…`.

## 9. Versioning

This document is **Seal Spec v1.0**. `seal.version` is the record's format version
(`1`). Future revisions are additive; a v1 consumer must keep working against
records that carry unknown extra fields.

## 10. Reuse

Drop `seal.mjs` into any project and import it — do not copy the hash by hand:

```js
import { makeSeal, verifySeal, sealFingerprint, SEAL_ID_RE } from "./seal.mjs";
const s = makeSeal({ title: "…", body: "…", tags: ["…"] });
if (!verifySeal(s)) throw new Error("broken seal");
```

Other languages: implement §3 and §4, then check against the §8 vectors. If your
vector matches, you are interoperable with every SealStack tool.
