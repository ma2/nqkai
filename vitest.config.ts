import { defineConfig } from "vitest/config";

// フェーズ1は純粋関数の単体テストのみ。loader / action の結合テスト（テスト用 D1）は
// @cloudflare/vitest-pool-workers で別途セットアップする。
export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    include: ["test/**/*.test.ts"],
    environment: "node",
  },
});
