import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { translateText } from "../js/i18n.js";

const root = path.resolve(".");
const issues = [];

for (const [source, expected] of [
  ["CoupleZone", "ركشة حب"],
  ["Log in", "تسجيل الدخول"],
  ["Question of the day", "سؤال اليوم"],
  ["Starting…", "قاعدين نبدوا..."]
]) {
  if (translateText(source) !== expected) issues.push(`Localization failed for "${source}".`);
}

const migrationPath = path.join(root, "supabase", "migrations", "202611070001_tunisian_turn_game.sql");
const migration = await readFile(migrationPath, "utf8");
if (!migration.includes("revoke all on public.answers from public, anon, authenticated;")) {
  issues.push("The game migration must revoke direct access to private answers.");
}
if (!migration.includes("using (user_id = auth.uid())")) {
  issues.push("The game migration must restrict answer rows to their owner.");
}
if (!migration.includes("'answers', case when round_row.status = 'revealed' then")) {
  issues.push("The game state RPC must reveal answers only after the round is revealed.");
}
if (!migration.includes("'answers', case when answer_count = 2 then")) {
  issues.push("The daily-question RPC must reveal answers only after both partners answer.");
}

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (entry.name === "node_modules" || entry.name === ".git") continue;
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await walk(absolute));
    else files.push(absolute);
  }
  return files;
}

for (const file of await walk(root)) {
  if (file.endsWith(".js")) {
    try {
      execFileSync(process.execPath, ["--check", file], { stdio: "pipe" });
    } catch (error) {
      issues.push(`${path.relative(root, file)} has a JavaScript syntax error:\n${error.stderr?.toString() || error.message}`);
    }
  }
  if (!file.endsWith(".html")) continue;
  const html = await readFile(file, "utf8");
  if (!html.includes('<html lang="ar-TN" dir="rtl">')) {
    issues.push(`${path.relative(root, file)} must declare Tunisian Arabic and RTL direction.`);
  }
  if (html.includes("CoupleZone") || html.includes("rekshahob.tn")) {
    issues.push(`${path.relative(root, file)} contains an outdated brand or unverified production domain.`);
  }
  const base = path.dirname(file);
  for (const [, attribute] of html.matchAll(/(?:src|href)="(\.\/[^"#?]+)"/g)) {
    const target = path.resolve(base, attribute);
    try {
      await readFile(target);
    } catch {
      issues.push(`${path.relative(root, file)} references missing ${attribute}`);
    }
  }
  if (file !== path.join(root, "index.html") && !html.includes('name="robots" content="noindex,nofollow"')) {
    issues.push(`${path.relative(root, file)} is missing noindex metadata`);
  }
}

if (issues.length) {
  console.error(issues.join("\n"));
  process.exitCode = 1;
} else {
  console.log("Static checks passed: local HTML assets resolve and private pages are noindex.");
}
