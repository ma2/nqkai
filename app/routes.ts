import { index, prefix, type RouteConfig, route } from "@react-router/dev/routes";

export default [
  index("routes/_index.tsx"),
  route("login", "routes/login.tsx"),
  route("register", "routes/register.tsx"),
  route("recover", "routes/recover.tsx"),
  route("settings", "routes/settings.tsx"),
  route("notifications", "routes/notifications.tsx"),

  // 結社
  route("orgs", "routes/orgs._index.tsx"),
  route("orgs/new", "routes/orgs.new.tsx"),
  route("orgs/:orgId", "routes/orgs.$orgId.tsx"),
  route("orgs/:orgId/admin", "routes/orgs.$orgId.admin.tsx"),

  // リソースルート（コンポーネントを持たず Response を返す）
  ...prefix("api", [
    ...prefix("auth", [
      route("register/options", "routes/api.auth.register.options.ts"),
      route("register/verify", "routes/api.auth.register.verify.ts"),
      route("login/options", "routes/api.auth.login.options.ts"),
      route("login/verify", "routes/api.auth.login.verify.ts"),
      route("credentials/options", "routes/api.auth.credentials.options.ts"),
      route("credentials/verify", "routes/api.auth.credentials.verify.ts"),
      route("recovery/redeem/options", "routes/api.auth.recovery.redeem.options.ts"),
      route("recovery/redeem/verify", "routes/api.auth.recovery.redeem.verify.ts"),
    ]),
    route("avatars/:userId", "routes/api.avatars.$userId.ts"),
  ]),
] satisfies RouteConfig;
