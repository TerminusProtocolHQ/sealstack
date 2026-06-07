# Publishing `sealstack-mcp`

Prerequisites: Node 18+ and an npm account (`npm login`). The name `sealstack-mcp`
was unclaimed at last check.

1. `npm test` — the conformance suite (also runs automatically via `prepublishOnly`).
2. Confirm `version` in `package.json` (currently `0.6.1`); commit any bump.
3. `npm publish` — unscoped packages publish public by default.
   - If the name is taken, scope it: set `"name": "@terminusprotocolhq/sealstack-mcp"`
     and run `npm publish --access public`.
4. Tag the release: `git tag v0.6.1 && git push --tags`.

After publishing, anyone can run it without cloning:

```json
{
  "mcpServers": {
    "sealstack": {
      "command": "npx",
      "args": ["-y", "sealstack-mcp"],
      "env": { "SEALSTACK_DATA": "/ABSOLUTE/PATH/TO/your/seals" }
    }
  }
}
```

Local dev still works with `"command": "node", "args": ["/abs/path/server.mjs"]`.
