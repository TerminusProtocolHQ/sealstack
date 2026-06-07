// SealStack — Card/Stack/Deck -> SKILL.md bridge (bare-bones, zero deps).
// Card -> one skill; Stack -> one workflow skill; Deck -> one workflow skill.
// Targets google-ai-edge/gallery skills: ---\nname:\ndescription:\n---\n<instructions>
import fs from "node:fs";
import path from "node:path";
import { slugify } from "./seal.mjs";
import { makeCard } from "./card.mjs";

function fmValue(s) { s = String(s).replace(/\r?\n/g, " ").trim(); return /[:#"'\[\]{}]/.test(s) ? JSON.stringify(s) : s; }

export function cardToSkillMd(card) {
  return `---\nname: ${slugify(card.title)}\ndescription: ${fmValue(card.summary || card.title)}\n---\n\n${String(card.body || "").trim()}\n`;
}
export function parseFrontmatter(md) {
  const m = /^---\s*\n([\s\S]*?)\n---\s*\n?([\s\S]*)$/.exec(String(md));
  if (!m) return { meta: {}, body: String(md).trim() };
  const meta = {};
  for (const line of m[1].split("\n")) {
    const mm = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(line.trim());
    if (!mm) continue;
    let v = mm[2].trim();
    if (v.startsWith('"') && v.endsWith('"')) { try { v = JSON.parse(v); } catch {} }
    meta[mm[1]] = v;
  }
  return { meta, body: m[2].trim() };
}
export function skillMdToCard(md, extra = {}) {
  const { meta, body } = parseFrontmatter(md);
  return makeCard({ title: meta.name || extra.title || "card", summary: meta.description || "", body, tags: extra.tags || [] });
}
export function stackToSkillMd(stack, cardsById = {}) {
  const name = slugify(stack.title), description = fmValue(stack.summary || stack.title);
  const steps = (stack.cards || []).map((id, i) => {
    const c = cardsById[id];
    return c ? `## Step ${i + 1}: ${c.title}\n${String(c.body).trim()}` : `## Step ${i + 1}: (missing ${id})`;
  });
  const intro = stack.body ? String(stack.body).trim() + "\n\n" : "";
  return `---\nname: ${name}\ndescription: ${description}\n---\n\n# ${stack.title}\n\n${intro}Run these steps in order:\n\n${steps.join("\n\n")}\n`;
}
export function deckToSkillMd(deck, stacksById = {}, cardsById = {}) {
  const name = slugify(deck.title), description = fmValue(deck.summary || deck.title);
  let n = 0;
  const sections = (deck.stacks || []).map((sid) => {
    const st = stacksById[sid];
    if (!st) return `## (missing stack ${sid})`;
    const steps = (st.cards || []).map((cid) => {
      const c = cardsById[cid]; n += 1;
      return c ? `${n}. **${c.title}** — ${String(c.body).trim().replace(/\s*\n+\s*/g, " ")}` : `${n}. (missing ${cid})`;
    });
    return `## ${st.title}\n${steps.join("\n")}`;
  });
  const intro = deck.summary ? String(deck.summary).trim() + "\n\n" : "";
  return `---\nname: ${name}\ndescription: ${description}\n---\n\n# ${deck.title}\n\n${intro}${sections.join("\n\n")}\n`;
}
export function writeSkill(md, name, outDir = "skills") {
  const dir = path.join(outDir, name); fs.mkdirSync(dir, { recursive: true });
  const p = path.join(dir, "SKILL.md"); fs.writeFileSync(p, md); return p;
}
function readJson(p) { return JSON.parse(fs.readFileSync(p, "utf8")); }
function indexVault(dir) {
  const byId = {};
  const walk = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const fp = path.join(d, e.name);
    if (e.isDirectory()) walk(fp);
    else if (e.name.endsWith(".json")) { try { const r = readJson(fp); if (r && r.id) byId[r.id] = r; } catch {} }
  } };
  if (fs.existsSync(dir)) walk(dir); return byId;
}
if (import.meta.url === `file://${process.argv[1]}`) {
  const argv = process.argv.slice(2);
  if (argv[0] === "export") {
    const rec = readJson(argv[1]);
    const vi = argv.indexOf("--vault"); const vault = vi > -1 ? argv[vi + 1] : path.dirname(argv[1]);
    const idx = indexVault(vault); let md;
    if (rec.stacks) md = deckToSkillMd(rec, idx, idx);
    else if (rec.cards) md = stackToSkillMd(rec, idx);
    else md = cardToSkillMd(rec);
    const outDir = argv[2] && !argv[2].startsWith("--") ? argv[2] : "skills";
    process.stderr.write(`Wrote ${writeSkill(md, slugify(rec.title), outDir)}\n`);
    process.stdout.write(md);
  } else if (argv[0] === "import") {
    process.stdout.write(JSON.stringify(skillMdToCard(fs.readFileSync(argv[1], "utf8")), null, 2) + "\n");
  } else { process.stderr.write("usage: node skill.mjs export <record.json> [outDir] [--vault <dir>] | import <SKILL.md>\n"); process.exit(1); }
}
