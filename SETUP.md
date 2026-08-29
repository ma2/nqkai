# SETUP — Cloudflare / GitHub の初期セットアップ

フェーズ1のコードは Docker のローカルエミュレーションで動作する（`wrangler.jsonc` の `database_id` / KV `id` はプレースホルダ）。
dev / production へデプロイするには、実リソースを作成して ID を差し込み、GitHub Secrets を登録する。

## 1. Cloudflare リソースの作成

`wrangler login` 済みの端末で実行する（`! wrangler login` で対話ログイン）。

```bash
# D1（dev / prod）
pnpm exec wrangler d1 create nqkai-dev
pnpm exec wrangler d1 create nqkai-prod

# KV（dev / prod）
pnpm exec wrangler kv namespace create nqkai-dev
pnpm exec wrangler kv namespace create nqkai-prod

# R2（dev / prod）
pnpm exec wrangler r2 bucket create nqkai-dev
pnpm exec wrangler r2 bucket create nqkai-prod
```

出力された `database_id` と KV の `id` を `wrangler.jsonc` の該当 env に差し込む
（`env.dev.d1_databases[0].database_id` など。現在は `0000...` のプレースホルダ）。

## 2. 環境変数・シークレット

`wrangler.jsonc` の `env.*.vars` にある `WEBAUTHN_RP_ID` / `WEBAUTHN_RP_NAME` / `WEBAUTHN_ORIGIN` を、
実際のデプロイ先ホスト名に合わせて更新する。

- dev: `nqkai-dev.<account>.workers.dev`（カスタムドメインを当てるならそのホスト）
- production: 本番ドメイン

センシティブな値が増えたら（例：将来の署名鍵）env ごとに登録する。

```bash
pnpm exec wrangler secret put SOME_SECRET --env dev
pnpm exec wrangler secret put SOME_SECRET --env production
```

## 3. リモート D1 へマイグレーション適用（初回）

CI が毎デプロイで実行するが、初回は手動でも可。

```bash
pnpm exec wrangler d1 migrations apply DB --env dev --remote
pnpm exec wrangler d1 migrations apply DB --env production --remote
```

## 4. GitHub Secrets

リポジトリの Settings → Secrets and variables → Actions に登録する。

| 名前 | 値 |
|------|----|
| `CLOUDFLARE_API_TOKEN` | Workers Scripts / D1 / R2 / Workers KV Storage の Edit 権限を持つ API トークン |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare のアカウント ID |

API トークンは Cloudflare ダッシュボード → My Profile → API Tokens → Create Token（"Edit Cloudflare Workers" テンプレート + D1/R2/KV の権限を追加）。

## 5. ブランチ保護（`main`）

Settings → Branches → Add rule（`main`）:

- Require a pull request before merging
- Require status checks to pass（`ci` を必須に）
- Do not allow direct pushes

## 6. デプロイの流れ

```
dev ブランチへ push        → GitHub Actions（deploy.yml）→ wrangler deploy --env dev
dev → main の PR をマージ   → GitHub Actions（deploy.yml）→ wrangler deploy --env production
```

各ジョブは `typecheck → lint → test → build → d1 migrations apply --remote → deploy` の順に実行する。

## 7. システム管理者の付与

登録フロー（パスキー作成）でユーザーを作った後に権限を付与する。

```bash
# ローカル
pnpm admin:grant you@example.com
# dev / production
pnpm admin:grant you@example.com --env dev
pnpm admin:grant you@example.com --env production
```
