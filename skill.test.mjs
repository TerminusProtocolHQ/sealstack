import { test } from "node:test";
import assert from "node:assert/strict";
import { cardToSkillMd, skillMdToCard, stackToSkillMd, deckToSkillMd } from "./skill.mjs";
import { makeCard, verifyCard } from "./card.mjs";
import { makeStack, makeDeck } from "./model.mjs";

test("card -> SKILL.md: frontmatter + body", () => {
  const c = makeCard({ title: "Summarize a diff", summary: "Tighten a diff into review notes.", body: "Do the thing." });
  const md = cardToSkillMd(c);
  assert.match(md, /^---\nname: summarize-a-diff\ndescription: Tighten a diff into review notes\.\n---\n/);
  assert.match(md, /Do the thing\./);
});
test("SKILL.md -> card round-trips", () => {
  const c = skillMdToCard("---\nname: query-wikipedia\ndescription: Query a topic.\n---\n\n# Do\nlook it up.");
  assert.equal(c.title, "query-wikipedia"); assert.equal(c.summary, "Query a topic."); assert.ok(verifyCard(c));
});
test("stack compiles ordered steps", () => {
  const a = makeCard({ title: "Step A", body: "do A" }); const b = makeCard({ title: "Step B", body: "do B" });
  const st = makeStack({ title: "My Flow", summary: "A then B.", cards: [a.id, b.id] });
  const md = stackToSkillMd(st, { [a.id]: a, [b.id]: b });
  assert.match(md, /name: my-flow/); assert.match(md, /Step 1: Step A[\s\S]*do A[\s\S]*Step 2: Step B[\s\S]*do B/);
});
test("deck compiles its stacks' cards", () => {
  const a = makeCard({ title: "Step A", body: "do A" }); const st = makeStack({ title: "Sec", cards: [a.id] });
  const dk = makeDeck({ title: "Big Flow", summary: "the pack", stacks: [st.id] });
  const md = deckToSkillMd(dk, { [st.id]: st }, { [a.id]: a });
  assert.match(md, /name: big-flow/); assert.match(md, /## Sec[\s\S]*Step A/);
});
