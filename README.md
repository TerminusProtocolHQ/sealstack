# SealStack

**A local-first, delivery-agnostic capability layer.** A **Card** is one reusable, sealed
(fingerprinted) unit — *what to do, use, produce, when to stop, what to record*. Author a Card
once; deliver it to any host: as injected context, as a `SKILL.md`, or as an MCP tool. The same
Card composes into **Stacks → Decks → Runs**.

> `github.com/TerminusProtocolHQ/sealstack` · *"SealStack" is a working name.*

## Requirements
Node 18+. **No dependencies, no build step.**

## Quick start
```bash
SEALSTACK_DATA="$PWD/cards" node server.mjs   # MCP server over stdio
```

## Connect to Claude Desktop
Add `claude_desktop_config.example.json`'s block to your Claude Desktop config (fix the two
paths). Published to npm? Use `"command":"npx","args":["-y","sealstack-mcp"]` (see `PUBLISHING.md`).

## Tools
| Tool | Does |
| --- | --- |
| `add_card` | Seal a new Card (`title`,`body`, optional `summary`/`tags`/`action`). |
| `update_card` | Re-seal a Card; metadata edits keep the id, content edits mint a new one. |
| `delete_card` | Delete by id — requires `confirm===id`; soft-deletes to `.trash/` unless `SEALSTACK_ALLOW_HARD_DELETE=1`. |
| `list_cards` / `search_cards` / `get_card` | Browse / search / fetch. |
| `verify_card` | Report `CONTENT_INTACT`/`CONTENT_BROKEN`, whether the record is canonical, and warn if it carries an unsealed `action`. |
| `build_context_packet` | Assemble Cards into one text blob for any model's context. |

## The Card shape
See `SPEC.md` and `schema/card.schema.json`. The `seal.fingerprint` is a SHA-256 over
`{title, body}` — edit the body and the seal breaks. `body` may be prose, instructions, or code.

## Skills & adapters
A Card delivers three ways (`skill.mjs` + `server.mjs`):
```bash
node skill.mjs export cards/<id>.json ./skills   # -> ./skills/<name>/SKILL.md (Edge Gallery)
node skill.mjs import path/to/SKILL.md            # -> a Card on stdout
```
- **context-packet** — cheapest; the body straight into a bare model's prompt.
- **SKILL.md** — for hosts with a skill system; frontmatter maps `title→name`, `summary→description`, `body→instructions`.
- **MCP tool** — for MCP hosts.

Stacks and Decks compile the same way (one ordered-steps `SKILL.md`). An optional **`action`**
seam lets a Card *act* on hosts that support it (e.g. `run_js`) — the host executes, not SealStack.

## Workflow tiers
`Card → Stack → Deck → Run` (`model.mjs`), each a sealed record referencing the tier below by id.
A sealed Run is its own receipt. SealStack defines and verifies; it never executes.

## Security
Tool args come from a model: every id-addressed access is validated (id shape + path containment
+ symlink refusal). The fingerprint proves *unchanged*, not *correct*. Operator judgment is final.

## Safety (v0.6.1)

Verification is canonical: a record must have a valid, *derived* id, not just a matching content hash. The verifier says `CONTENT_INTACT` (not `INTACT`) and flags any unsealed `action` — "sealed" means content (title+body) only. Deletes are confirmed + soft by default (`.trash/`); writes are atomic (temp+fsync+rename); the default vault is `~/.sealstack/cards`. `list`/`search` label records `INTACT | BROKEN | MALFORMED`.

## License
MIT.
