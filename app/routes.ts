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
  route("orgs/:orgId/kukai/new", "routes/orgs.$orgId.kukai.new.tsx"),

  // 個人の公開句集
  route("u/:publicId", "routes/u.$publicId.tsx"),

  // 句会
  route("kukai", "routes/kukai._index.tsx"),
  route("kukai/:kukaiId", "routes/kukai.$kukaiId.tsx"),
  route("kukai/:kukaiId/submit", "routes/kukai.$kukaiId.submit.tsx"),
  route("kukai/:kukaiId/select", "routes/kukai.$kukaiId.select.tsx"),
  route("kukai/:kukaiId/results", "routes/kukai.$kukaiId.results.tsx"),

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
    route("orgs/:orgId/image", "routes/api.orgs.$orgId.image.ts"),
    route("kukai/:kukaiId/state", "routes/api.kukai.$kukaiId.state.ts"),
    route("kukai/:kukaiId/export", "routes/api.kukai.$kukaiId.export.ts"),
    route("u/:publicId/haiku.txt", "routes/api.u.$publicId.haiku-txt.ts"),
  ]),
] satisfies RouteConfig;
