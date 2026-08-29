/**
 * 既存ユーザーにシステム管理者権限を付与する。
 *
 *   pnpm admin:grant <email>                  # ローカル D1
 *   pnpm admin:grant <email> --env dev        # dev 環境の D1（--remote）
 *   pnpm admin:grant <email> --env production # 本番の D1（--remote）
 */
import { execFileSync } from "node:child_process";

const argv = process.argv.slice(2);
const email = argv.find((a) => !a.startsWith("--"));
const envIndex = argv.indexOf("--env");
const targetEnv = envIndex !== -1 ? argv[envIndex + 1] : undefined;

if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
  console.error("使い方: pnpm admin:grant <email> [--env dev|production]");
  process.exit(1);
}
if (envIndex !== -1 && targetEnv !== "dev" && targetEnv !== "production") {
  console.error("--env には dev または production を指定してください");
  process.exit(1);
}

const wranglerArgs = ["exec", "wrangler", "d1", "execute", "DB"];
if (targetEnv) {
  wranglerArgs.push("--env", targetEnv, "--remote");
} else {
  wranglerArgs.push("--local");
}
const safeEmail = email.replace(/'/g, "''");
wranglerArgs.push(
  "--command",
  `UPDATE users SET is_system_admin = 1, updated_at = (unixepoch() * 1000) WHERE email = '${safeEmail}'`,
);

execFileSync("pnpm", wranglerArgs, { stdio: "inherit" });
console.log(`granted system admin: ${email}${targetEnv ? ` (${targetEnv})` : " (local)"}`);
