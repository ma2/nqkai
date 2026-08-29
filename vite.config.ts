import { cloudflare } from "@cloudflare/vite-plugin";
import { reactRouter } from "@react-router/dev/vite";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

export default defineConfig({
  // tsconfig の paths（~/* → app/*）を Vite ネイティブで解決
  resolve: { tsconfigPaths: true },
  plugins: [
    // Cloudflare の Workers ランタイム + ローカル D1/R2/KV エミュレーションを提供
    cloudflare({ viteEnvironment: { name: "ssr" } }),
    tailwindcss(),
    reactRouter(),
  ],
});
