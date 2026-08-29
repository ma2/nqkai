import { index, prefix, type RouteConfig, route } from "@react-router/dev/routes";

export default [
  index("routes/_index.tsx"),
  route("login", "routes/login.tsx"),
  route("register", "routes/register.tsx"),
  route("settings", "routes/settings.tsx"),

  // リソースルート（コンポーネントを持たず Response を返す）
  ...prefix("api", [
    ...prefix("auth", [
      route("register/options", "routes/api.auth.register.options.ts"),
      route("register/verify", "routes/api.auth.register.verify.ts"),
      route("login/options", "routes/api.auth.login.options.ts"),
      route("login/verify", "routes/api.auth.login.verify.ts"),
      route("credentials/options", "routes/api.auth.credentials.options.ts"),
      route("credentials/verify", "routes/api.auth.credentials.verify.ts"),
    ]),
    route("avatars/:userId", "routes/api.avatars.$userId.ts"),
  ]),
] satisfies RouteConfig;
