# SealStack — Hardening Report (v0.5.0 → v0.6.1)

In response to the external audit ("PASS WITH RELEASE BLOCKERS"). Every blocker, the
high-priority issue, and all five medium issues are addressed, with evidence. Re-audit welcome.

## Blockers
### Blocker 1 — `verifyCard()` / `verifyRecord()` too weak → **FIXED**
`verifyCard` now requires: id shape (`CARD_ID_RE`), fingerprint shape (`^sha256:[0-9a-f]{64}$`),
`seal.version===1`, recomputed fingerprint == stored, **and `id === cardId(title, fingerprint)`**.
`verifyRecord` enforces the same per kind (Stack/Deck `slug-<6hex>`; Run `run-<10hex>`).
**Evidence:** tests "wrong/non-canonical id fails verification" for Card *and* Stack/Deck/Run pass;
`verifyCard({...c, id:"wrong-abcdef"}) === false`; `node --test` 13/13.

### Blocker 2 — `action` tamperable without breaking verification → **ADDRESSED (claim boundary)**
`action` stays an unsealed, additive seam (the executing adapter is deferred). The *claim* is now honest:
the verifier reports **`CONTENT_INTACT`** (not `INTACT`) and **WARNS** when a Card carries an `action`
not covered by the seal; `add_card`/`update_card` say the same; `hasUnsealedAction()` is exported; the
SPEC states "sealed = content only," and a separate execution/delivery-manifest seal is the deferred
action-adapter's job.
**Evidence:** `verify_card` on an action Card prints `CONTENT_INTACT … WARNING: carries an 'action' NOT
covered by the seal`; unit test asserts `hasUnsealedAction` + content still verifies.

### High — model-callable destructive `delete_card` → **FIXED**
`delete_card` now requires `confirm === id` **and** soft-deletes to `.trash/` by default; permanent
deletion only with `SEALSTACK_ALLOW_HARD_DELETE=1`. `update_card` also moves superseded versions to `.trash/`.
**Evidence:** delete without `confirm` → "Refusing to delete…"; with `confirm` → "Soft-deleted … .trash/";
file present in `.trash/`.

## Medium issues
1. **PUBLISHING.md drift** → FIXED (now `0.6.1` / `v0.6.1`).
2. **npx-hostile default data dir** → FIXED (`~/.sealstack/cards` via `os.homedir()`; override `SEALSTACK_DATA`).
3. **Non-atomic writes** → FIXED (`writeJsonAtomic`: temp + `fsync` + `rename`) for add/update.
4. **list/search surfaced broken records as normal** → FIXED (every record tagged `INTACT | BROKEN | MALFORMED`; unparseable files shown as MALFORMED).
5. **No Stack/Deck/Run schemas** → FIXED (`schema/{stack,deck,run}.schema.json`; examples validate; a deck is correctly *rejected* by the stack schema).

## Tests added (the audit's requested set)
wrong Card id fails ✓ · wrong Stack/Deck/Run id fails ✓ · action carried + content-verifies + flagged ✓ ·
delete requires confirmation + soft-delete ✓ (MCP smoke) · malformed records show as MALFORMED ✓ (MCP smoke).

## Verification summary
- `node --check` clean: seal, card, model, skill, server.
- `node --test`: **13/13** (card 5, model 4, skill 4).
- **Golden vector unchanged:** `Temp test/hello → sha256:a51cc2…`; example card ids identical (`ai-build-preflight-d96c13`, `summarize-a-diff-637455`).
- Schemas validate all examples; cross-kind rejected.
- MCP smoke confirmed: action warning, status classification, confirmed soft-delete, `~/.sealstack/cards` default.
- Zero runtime dependencies retained.

## Deliberately unchanged (flagged for the auditor)
- `action` is intentionally **unsealed** in v0.6; the execution/delivery-manifest seal is the deferred
  action-adapter (its own future Phase-1 → full KSL). Until then the verifier never claims more than content.
- "SealStack" remains a placeholder brand.


## v0.6.1 patch

Fixes the verifier/status consistency gap found after v0.6.0:

- `makeCard()` rejects non-string and whitespace-only title/body values.
- `verifyCard()` rejects malformed records before hashing, including coerced object/array title/body cases.
- `verifyRecord()` performs kind-specific Stack/Deck/Run structural validation before hashing.
- `list_cards` / `search_cards` use canonical `verifyCard()` status; version/canonical mismatches no longer display as `INTACT`.
- `verify_card` reports `MALFORMED` for malformed records instead of computing misleading content fingerprints.
- npm package files now include the runtime entrypoint, referenced docs/config, tests, and receipt/hardening files.

Evidence: `node --check` pass, `npm test` 17/17 pass, `npm pack --dry-run` pass, MCP smoke pass.

**Version: 0.6.1.**
