# SealStack

**A local-first MCP server for storing and serving Seals.**

A **Seal** is one reusable, fingerprinted workflow unit — a small, self-contained move an agent can read and run (*what to do, what to use, what to produce, when to stop, what to record*). You put Seals in; SealStack fingerprints each one so it's tamper-evident, and serves them to any MCP client (Claude Desktop and friends).

> Org: `github.com/TerminusProtocolHQ/sealstack` · Home (for now): `terminusprotocol.io/SealStack`

This is **SealStack V1**: the *Stack* pillar (Seals) + the local MCP. Index and Seal-provenance grow on top later; the execution engine stays parked.

## Requirements

Node.js 18+. **No dependencies, no build step.**

## Quick start

```bash
# from this folder
SEALSTACK_DATA="$PWD/seals" node server.mjs
```

It speaks MCP over stdio, so on its own it just waits for a client. Point an MCP client at it (below). If `SEALSTACK_DATA` is unset it defaults to `./seals` next to the server.

## Connect it to Claude Desktop

Edit your Claude Desktop config (macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`, Windows: `%APPDATA%\Claude\claude_desktop_config.json`) — see `claude_desktop_config.example.json`:

```json
{
  "mcpServers": {
    "sealstack": {
      "command": "node",
      "args": ["/ABSOLUTE/PATH/TO/sealstack/server.mjs"],
      "env": { "SEALSTACK_DATA": "/ABSOLUTE/PATH/TO/your/seals" }
    }
  }
}
```

Restart Claude Desktop. Then try: *"List my Seals,"* *"Add a Seal for triaging a bug report,"* *"Search my Seals for review,"* *"Verify the ai-build-preflight Seal."*

## What it exposes (tools)

| Tool | What it does |
| --- | --- |
| `add_seal` | Seal a new unit (`title`, `body`, optional `summary`, `tags`). Fingerprints + saves it. |
| `list_seals` | List all Seals, optional `tag` filter. |
| `search_seals` | Keyword search over title / summary / tags / body. |
| `get_seal` | Return one full Seal (with fingerprint) by `id`. |
| `verify_seal` | Recompute the fingerprint and report INTACT or BROKEN. |
| `build_context_packet` | Assemble selected Seals (`ids`) into one text packet for an agent's context. |

## Two ways to add a Seal

1. **Ask an agent** to call `add_seal` (it gets fingerprinted automatically).
2. **Drop a JSON file** into your data folder — the server scans the folder on every read. (Run `verify_seal` afterward, or re-add via the tool, to stamp a fingerprint.)

## The Seal shape

See `schema/seal.schema.json`. In short:

```json
{
  "id": "ai-build-preflight-d96c13",
  "title": "AI build preflight",
  "summary": "Check an AI-built app before publishing.",
  "tags": ["preflight", "ship-readiness"],
  "body": "Goal… Do… Produce… Stop when… Record…",
  "seal": { "fingerprint": "sha256:…", "created": "…", "version": 1 }
}
```

The `seal.fingerprint` is a SHA-256 over the canonical `{title, body}`. Edit the body and the seal breaks — that's the point.

## The standard

The authoritative definition is [`SEAL_SPEC.md`](./SEAL_SPEC.md) (Seal Spec v1.0), with the one reference implementation in [`seal.mjs`](./seal.mjs) and a machine-readable [`schema/seal.schema.json`](./schema/seal.schema.json). Building something else that uses Seals? Import `seal.mjs` and follow the spec — never re-derive the fingerprint by hand.

## Boundary

- **Local-first** — reads/writes only inside your `SEALSTACK_DATA` folder.
- **No network** — zero outbound requests.
- **No shell** — Seal bodies are returned as text; nothing here executes them.

A fingerprint proves a Seal is *unchanged*, not that it is *correct, safe, or good*. Operator judgment is final.

## Security

SealStack treats tool arguments as untrusted — they arrive from a model that can be
steered by content it reads. Every id-addressed file access (`get_seal`, `verify_seal`,
`build_context_packet`, and `add_seal`) is checked three ways before any file is touched:

1. **Id shape** — the id must match the canonical `slug-title-abcdef` pattern.
2. **Lexical containment** — the resolved path must stay inside `SEALSTACK_DATA`.
3. **Real-path containment** — if the target exists it must not be a symlink, and its
   symlink-resolved path must still be inside the vault. Directory scans skip symlinks
   and non-regular files.

Together these block path-traversal (`../…`) and symlink-escape reads and writes. A
fingerprint proves a Seal is *unchanged*, not that it is *correct or safe* — operator
judgment is final. Found a gap? Open an issue on `TerminusProtocolHQ/sealstack`.

## Optional self-test

```bash
printf '%s\n' \
'{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{}}}' \
'{"jsonrpc":"2.0","method":"notifications/initialized"}' \
'{"jsonrpc":"2.0","id":2,"method":"tools/list"}' \
| SEALSTACK_DATA="$PWD/seals" node server.mjs
```

You should see an `initialize` result and the six tools.

## License

MIT.
