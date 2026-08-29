import { createContext } from "react-router";

/** Worker の fetch ハンドラが seed し、loader / action から取り出す Cloudflare バインディング */
export const cloudflareContext = createContext<{
  env: Env;
  ctx: ExecutionContext;
}>();
