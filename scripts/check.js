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

const turnEnginePath = path.join(root, "supabase", "migrations", "202611070003_single_turn_game_engine.sql");
const turnEngine = await readFile(turnEnginePath, "utf8");
const roomGame = await readFile(path.join(root, "js", "room-game.js"), "utf8");
const gameEngine = await readFile(path.join(root, "js", "game-engine.js"), "utf8");
if ((turnEngine.match(/select 10::smallint/g) || []).length !== 1) {
  issues.push("The database game engine must define its round limit once.");
}
for (const required of [
  "unique index if not exists game_rounds_session_round_turn_idx",
  "session_row.current_turn = 1",
  "session_row.current_round < session_row.total_rounds",
  "session_row.current_turn = 2 and session_row.current_round = session_row.total_rounds",
  "'answers', case when turn_row.status = 'revealed' then",
  "revoke execute on function public.advance_game_round(uuid)"
]) {
  if (!turnEngine.includes(required)) issues.push(`The single-turn game migration is missing: ${required}`);
}
for (const rpc of [
  "create_room", "join_room", "start_room_game", "get_room_game_state",
  "ask_room_game_question", "submit_room_game_answer", "reveal_room_game_turn", "advance_room_game_turn"
]) {
  if (!gameEngine.includes(`"${rpc}"`)) issues.push(`The frontend game engine is missing the ${rpc} RPC.`);
}
for (const event of ["QUESTION_SENT", "ANSWER_SUBMITTED", "REVEAL_READY", "REVEAL_SHOWN", "TURN_CHANGED", "ROUND_COMPLETED", "GAME_FINISHED"]) {
  if (!gameEngine.includes(`"${event}"`) || !turnEngine.includes(`'${event}'`)) {
    issues.push(`The ${event} event must be shared by the client and database game engines.`);
  }
}
if (roomGame.includes("advance_game_round") || roomGame.includes("submit_turn_game_answer")) {
  issues.push("The room UI must not call the legacy round/turn engine.");
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
