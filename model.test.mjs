import { test } from "node:test";
import assert from "node:assert/strict";
import { makeCard } from "./card.mjs";
import { makeStack, makeDeck, makeRun, resolveDeck, verifyRecord } from "./model.mjs";

test("stack: references cards, verifies, tamper fails", () => {
  const a = makeCard({ title: "A", body: "do a" }); const b = makeCard({ title: "B", body: "do b" });
  const st = makeStack({ title: "Flow", cards: [a.id, b.id] });
  assert.deepEqual(st.cards, [a.id, b.id]); assert.ok(verifyRecord(st));
  assert.ok(!verifyRecord({ ...st, cards: [a.id] }));
});
test("deck: resolves down to cards, verifies", () => {
  const a = makeCard({ title: "A", body: "x" }); const st = makeStack({ title: "S", cards: [a.id] });
  const dk = makeDeck({ title: "Pack", stacks: [st.id] });
  assert.ok(verifyRecord(dk));
  assert.equal(resolveDeck(dk, { [st.id]: st }, { [a.id]: a }).stacks[0].cards[0].id, a.id);
});
test("run: sealed self-receipt, verifies, tamper fails", () => {
  const dk = makeDeck({ title: "Pack", stacks: ["s-aaaaaa"] });
  const run = makeRun({ deck: dk.id, deckFingerprint: dk.seal.fingerprint, outcome: "ok", status: "done" });
  assert.match(run.id, /^run-[0-9a-f]{10}$/); assert.ok(verifyRecord(run));
  assert.ok(!verifyRecord({ ...run, outcome: "tampered" }));
});
test("BLOCKER-1: wrong stack/deck/run id fails verification", () => {
  const a = makeCard({ title: "A", body: "x" }); const st = makeStack({ title: "S", cards: [a.id] });
  assert.ok(!verifyRecord({ ...st, id: "wrong-abcdef" }));
  const dk = makeDeck({ title: "Pack", stacks: [st.id] });
  assert.ok(!verifyRecord({ ...dk, id: "wrong-abcdef" }));
  const run = makeRun({ deck: dk.id });
  assert.ok(!verifyRecord({ ...run, id: "run-0000000000" }));
});

test("v0.6.1: verifyRecord rejects schema-invalid stack/deck/run records even with matching derived seal", async () => {
  const { canonFingerprint, slugify } = await import("./seal.mjs");
  const idFrom = (title, fp) => `${slugify(title)}-${fp.slice(7, 13)}`;

  const badStackPayload = { kind: "stack", title: "Bad Stack", cards: "not-array" };
  const stackFp = canonFingerprint(badStackPayload);
  assert.equal(verifyRecord({ id: idFrom("Bad Stack", stackFp), ...badStackPayload, seal: { fingerprint: stackFp, created: new Date().toISOString(), version: 1 } }), false);

  const badDeckPayload = { kind: "deck", title: "Bad Deck", stacks: "not-array" };
  const deckFp = canonFingerprint(badDeckPayload);
  assert.equal(verifyRecord({ id: idFrom("Bad Deck", deckFp), ...badDeckPayload, seal: { fingerprint: deckFp, created: new Date().toISOString(), version: 1 } }), false);

  const badRunPayload = { kind: "run", deck: "ship-a-build-005b8d", deckFingerprint: "", model: "", input: "", outcome: "", status: "done", startedAt: "not-a-date", finishedAt: "" };
  const runFp = canonFingerprint(badRunPayload);
  assert.equal(verifyRecord({ id: `run-${runFp.slice(7, 17)}`, ...badRunPayload, seal: { fingerprint: runFp, created: new Date().toISOString(), version: 1 } }), false);
});
