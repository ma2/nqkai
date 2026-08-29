import type { RouterContextProvider } from "react-router";
import { cloudflareContext } from "./cloudflare.server";
import { createDb, type Db } from "./db/client.server";

export interface ServerContext {
  env: Env;
  db: Db;
}

/** loader / action / リソースルートの先頭で呼び、env と db を取り出す。 */
export function getServerContext(context: Readonly<RouterContextProvider>): ServerContext {
  const { env } = context.get(cloudflareContext);
  return { env, db: createDb(env.DB) };
}
