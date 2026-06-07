import { test } from "node:test";
import assert from "node:assert/strict";
import { makeCard, verifyCard, cardId, CARD_ID_RE, hasUnsealedAction } from "./card.mjs";

test("GOLDEN (unchanged): Temp test / hello", () => {
  const c = makeCard({ title: "Temp test", body: "hello" });
  assert.equal(c.seal.fingerprint, "sha256:a51cc23f48b515700c57f4794c5d6946c8e4543b3d4f4df191c4d78a27c364f5");
  assert.equal(c.id, "temp-test-a51cc2");
  assert.ok(verifyCard(c));
});
test("conformant + verify + content tamper fails", () => {
  const c = makeCard({ title: "Hello world!", body: "do it", tags: ["x"] });
  assert.ok(CARD_ID_RE.test(c.id)); assert.equal(c.seal.version, 1); assert.ok(verifyCard(c));
  assert.ok(!verifyCard({ ...c, body: "changed" }));
});
test("BLOCKER-1: wrong/non-canonical id fails verification", () => {
  const c = makeCard({ title: "Hello world!", body: "do it" });
  assert.ok(!verifyCard({ ...c, id: "wrong-abcdef" }));   // shape-valid but not derived
  assert.ok(!verifyCard({ ...c, id: "NOTANID" }));        // bad shape
  assert.ok(!verifyCard({ ...c, seal: { ...c.seal, version: 2 } }));
  assert.ok(!verifyCard({ ...c, seal: { ...c.seal, fingerprint: "nope" } }));
});
test("action: carried, content still verifies, flagged as unsealed", () => {
  const a = makeCard({ title: "T", body: "b" });
  const b = makeCard({ title: "T", body: "b", action: { tool: "run_js", asset: "x.js" } });
  assert.equal(a.seal.fingerprint, b.seal.fingerprint); // action not in seal
  assert.ok(verifyCard(b));            // content+id canonical
  assert.ok(hasUnsealedAction(b));     // but the action is NOT covered -> must be flagged
  assert.ok(!hasUnsealedAction(a));
});
test("requires title and body", () => {
  assert.throws(() => makeCard({ title: "", body: "x" }));
  assert.throws(() => makeCard({ title: "x", body: "" }));
});

test("v0.6.1: non-string and whitespace-only title/body are rejected", () => {
  assert.throws(() => makeCard({ title: { x: 1 }, body: "x" }), /title.*string/);
  assert.throws(() => makeCard({ title: "x", body: ["body-array"] }), /body.*string/);
  assert.throws(() => makeCard({ title: "   ", body: "x" }), /non-empty normalized 'title'/);
  assert.throws(() => makeCard({ title: "x", body: "   \r\n  " }), /non-empty normalized 'body'/);
});

test("v0.6.1: verifyCard rejects schema-invalid records even if coerced fingerprint/id match", async () => {
  const { sealFingerprint } = await import("./seal.mjs");
  const title = { x: 1 };
  const body = ["body-array"];
  const fp = sealFingerprint(title, body);
  const forged = {
    id: cardId(title, fp),
    title,
    body,
    seal: { fingerprint: fp, created: "not-a-date", version: 1 },
  };
  assert.equal(verifyCard(forged), false);
});

test("v0.6.1: verifyCard rejects unnormalized stored title/body", () => {
  const c = makeCard({ title: "Trim me", body: "body" });
  assert.equal(verifyCard({ ...c, title: " Trim me" }), false);
  assert.equal(verifyCard({ ...c, body: "body\n" }), false);
});
