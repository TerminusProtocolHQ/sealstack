# SealStack — KSL Phase 2 Receipt (v0.6.1)

## Verdict

PASS — publishable as a local-first content-sealing MCP prototype.

Not a sealed execution system. The optional `action` seam remains host-executed and intentionally **not** covered by the Card content seal.

## Fixes since v0.6.0

- `makeCard()` now rejects non-string title/body inputs.
- `makeCard()` now rejects whitespace-only normalized title/body values.
- `makeCard()` stores normalized title/body values.
- `verifyCard()` now rejects schema-invalid records before hashing.
- `verifyCard()` rejects unnormalized stored title/body values.
- `verifyRecord()` now performs kind-specific structural validation for Stack, Deck, and Run records before hashing.
- `list_cards` / `search_cards` status now delegates canonical integrity to `verifyCard()`; version or canonical mismatches no longer display as `INTACT`.
- `verify_card` reports `MALFORMED` instead of calculating content fingerprints for malformed records.
- npm `files` now includes `server.mjs`, docs referenced by README, Claude config example, tests, and receipt/hardening files.
- Package version bumped to `0.6.1`.

## Evidence

- `node --check`: pass for source files.
- `npm test`: 17/17 pass.
- `npm pack --dry-run`: package includes runtime entrypoint, referenced docs/config, schemas, examples, and tests.
- MCP smoke: `initialize`, `tools/list`, `add_card`, `list_cards`, and `verify_card` pass against an isolated temp data dir.

## Claim boundary

The seal proves canonical content integrity for Card title/body and canonical identity for Stack/Deck/Run records. It does not prove workflow correctness, action safety, host behavior, or vulnerability freedom.
