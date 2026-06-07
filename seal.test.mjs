// SealStack — conformance tests for Seal Spec v1.0. Zero deps (node:test).
// Run: npm test   (or: node --test)
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { sealFingerprint, sealId, makeSeal, verifySeal, SEAL_ID_RE, SEAL_SPEC_VERSION } from "./seal.mjs";

const sealsDir = fileURLToPath(new URL("./seals", import.meta.url));

test("golden vector: Temp test / hello", () => {
  const fp = sealFingerprint("Temp test", "hello");
  assert.equal(fp, "sha256:a51cc23f48b515700c57f4794c5d6946c8e4543b3d4f4df191c4d78a27c364f5");
  assert.equal(sealId("Temp test", fp), "temp-test-a51cc2");
});

test("fingerprint covers title+body only — metadata is irrelevant", () => {
  const a = makeSeal({ title: "X", body: "Y", tags: ["a"], summary: "one" });
  const b = makeSeal({ title: "X", body: "Y", tags: ["b", "c"], summary: "two" });
  assert.equal(a.seal.fingerprint, b.seal.fingerprint);
});

test("canonicalization: CRLF and edge whitespace don't change the seal", () => {
  assert.equal(sealFingerprint("  T  ", "a\r\nb"), sealFingerprint("T", "a\nb"));
  assert.equal(sealFingerprint("T", "  body  "), sealFingerprint("T", "body"));
});

test("id shape regex accepts valid, rejects invalid", () => {
  assert.ok(SEAL_ID_RE.test("temp-test-a51cc2"));
  assert.ok(SEAL_ID_RE.test("ai-build-preflight-d96c13"));
  assert.ok(!SEAL_ID_RE.test("../etc/passwd"));
  assert.ok(!SEAL_ID_RE.test("Temp-Test-a51cc2")); // uppercase
  assert.ok(!SEAL_ID_RE.test("temp-test-zzzzzz")); // non-hex tail
});

test("makeSeal produces a conformant record", () => {
  const s = makeSeal({ title: "Hello world!", body: "do the thing" });
  assert.ok(SEAL_ID_RE.test(s.id));
  assert.equal(s.seal.version, 1);
  assert.match(s.seal.fingerprint, /^sha256:[0-9a-f]{64}$/);
  assert.ok(!Number.isNaN(Date.parse(s.seal.created)));
  assert.ok(verifySeal(s));
});

test("makeSeal requires title and body", () => {
  assert.throws(() => makeSeal({ title: "", body: "x" }));
  assert.throws(() => makeSeal({ title: "x", body: "" }));
});

test("tamper is detected (BROKEN)", () => {
  const s = makeSeal({ title: "t", body: "original" });
  assert.equal(verifySeal({ ...s, body: "edited" }), false);
});

test("shipped example Seals are conformant fixtures", () => {
  const files = fs.readdirSync(sealsDir).filter((f) => f.endsWith(".json"));
  assert.ok(files.length >= 2, "expected example Seals");
  for (const f of files) {
    const rec = JSON.parse(fs.readFileSync(`${sealsDir}/${f}`, "utf8"));
    assert.equal(sealFingerprint(rec.title, rec.body), rec.seal.fingerprint, `fingerprint ${rec.id}`);
    assert.equal(sealId(rec.title, rec.seal.fingerprint), rec.id, `id ${rec.id}`);
    assert.ok(verifySeal(rec), `verify ${rec.id}`);
  }
});

test("spec version is 1.0", () => {
  assert.equal(SEAL_SPEC_VERSION, "1.0");
});
