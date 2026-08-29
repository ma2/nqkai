import { defineConfig } from "drizzle-kit";

// マイグレーション SQL の生成のみに使用する（適用は wrangler d1 migrations apply）。
export default defineConfig({
  dialect: "sqlite",
  schema: "./app/server/db/schema.ts",
  out: "./migrations",
  casing: "snake_case",
});
