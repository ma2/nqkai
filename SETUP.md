# SETUP — Cloudflare / GitHub の初期セットアップ

## 環境と URL

- アカウント `e1bfc1ed29f5c1f17e23a9d77a3fad8a`、リージョン APAC
- workers.dev サブドメインは **`mckoy`**（アカウント共有・変更しない）。環境は Worker 名で区別する。

| 環境 | Worker 名 | URL | git ブランチ |
|------|-----------|-----|--------------|
| staging | `nqkai-staging` | `https://nqkai-staging.mckoy.workers.dev` | `dev` |
| production | `nqkai-prod` | `https://nqkai-prod.mckoy.workers.dev` | `main` |

## 状態（リファレンス運用 = ma2 のアカウント）

- ✅ Cloudflare リソース作成済み（`wrangler.jsonc` に反映）
  - D1: `nqkai-staging` (`1f1d1edc-1e83-40e9-97bb-55bbbbee4be3`) / `nqkai-prod` (`6084cfde-648d-45d6-be8c-26b83bd4b95c`)
  - KV: `nqkai-staging` (`3a75afdfe34c43d6a6d27b2dc5ce2c8d`) / `nqkai-prod` (`a9c1955eb227473a8faa0695301d2a0d`)
  - R2: `nqkai-staging` / `nqkai-prod`
- ✅ staging / production ともデプロイ済み・リモート D1 マイグレーション済み・GitHub Secrets 登録済み
- ✅ CI/CD 稼働（`dev`→staging / `main`→production を実地確認）
- ⏳ `main` ブランチ保護ルールセットの Enforcement を `Active` にする（構成済み・現在 disabled）

> `wrangler.jsonc` にある `database_id` / KV `id` / `WEBAUTHN_*` はこのリファレンス運用の値。**秘密情報ではない**（`CLOUDFLARE_API_TOKEN` が無ければ何もできない）。別アカウントで運用する場合は「6. フォークして自分で運用する」を参照。

## 1. リモート D1 へマイグレーション適用

CI が毎デプロイで実行するが、初回は手動で流す（`wrangler login` 済みの端末で）。

```bash
pnpm db:migrate:staging   # = wrangler d1 migrations apply DB --env staging --remote
pnpm db:migrate:prod      # = wrangler d1 migrations apply DB --env production --remote
```

## 2. GitHub Secrets

リポジトリの Settings → Secrets and variables → Actions に登録する。

| 名前 | 値 |
|------|----|
| `CLOUDFLARE_ACCOUNT_ID` | `e1bfc1ed29f5c1f17e23a9d77a3fad8a` |
| `CLOUDFLARE_API_TOKEN` | Workers Scripts / D1 / R2 / Workers KV Storage の Edit 権限を持つ API トークン |

API トークンは Cloudflare ダッシュボード → My Profile → API Tokens → Create Token（"Edit Cloudflare Workers" テンプレートに D1 / R2 / KV の Edit を追加）。

## 3. ブランチ保護（`main`）

Settings → Rules（または Branches）→ ルールセット `main`:

- Require a pull request before merging
- Require status checks to pass → **`ci`**（1 度実行されるまで一覧に出ないので手入力でも可）
- Block force pushes / 直接 push を禁止
- **Enforcement status を `Active`**（`Disabled` のままだと効かない）

## 4. 初回デプロイ

staging はデプロイ済み。production はマイグレーション適用のあと手動で初回デプロイ：

```bash
pnpm deploy:prod      # = CLOUDFLARE_ENV=production react-router build && wrangler deploy
# 再デプロイが要るときは staging も
pnpm deploy:staging
```

以降は自動：

```
dev ブランチへ push        → GitHub Actions（deploy.yml）→ CLOUDFLARE_ENV=staging + wrangler deploy
dev → main の PR をマージ   → GitHub Actions（deploy.yml）→ CLOUDFLARE_ENV=production + wrangler deploy
```

各ジョブは `typecheck → lint → test → build → d1 migrations apply --remote → deploy` の順。
`@cloudflare/vite-plugin` はビルド時の `CLOUDFLARE_ENV` で env を選ぶため、`wrangler deploy` に `--env` は付けない。

## 5. システム管理者の付与

登録フロー（パスキー作成）でユーザーを作った後に付与する。

```bash
pnpm admin:grant you@example.com                  # ローカル
pnpm admin:grant you@example.com --env staging    # staging
pnpm admin:grant you@example.com --env production # production
```

## 6. フォークして自分で運用する

`wrangler.jsonc` の `database_id` / KV `id` / bucket 名 / `WEBAUTHN_*` は ma2 のアカウントのリファレンス運用向け。別の Cloudflare アカウントで動かすには自分用に作り直す。

1. `wrangler login`（自分のアカウント）
2. リソースを作成し、出力された ID を控える：
   ```bash
   pnpm exec wrangler d1 create <staging名> && pnpm exec wrangler d1 create <prod名>
   pnpm exec wrangler kv namespace create <staging名> && pnpm exec wrangler kv namespace create <prod名>
   pnpm exec wrangler r2 bucket create <staging名> && pnpm exec wrangler r2 bucket create <prod名>
   # R2 が未有効ならダッシュボードで「Enable R2」
   ```
3. `wrangler.jsonc` を編集：
   - `env.staging` / `env.production` の `d1_databases[].database_id`、`d1_databases[].database_name`、`r2_buckets[].bucket_name`、`kv_namespaces[].id` を自分の値に
   - `env.*.name`（Worker 名）を任意に
   - `env.*.vars.WEBAUTHN_RP_ID` / `WEBAUTHN_ORIGIN` を自分のデプロイ先ホスト（`<worker名>.<自分のサブドメイン>.workers.dev`、またはカスタムドメイン）に。`WEBAUTHN_RP_ID` は `ORIGIN` のホスト名部分と一致させる
4. GitHub（フォーク先）に Secrets `CLOUDFLARE_ACCOUNT_ID` / `CLOUDFLARE_API_TOKEN` を登録
5. `pnpm db:migrate:staging` / `pnpm db:migrate:prod` → `pnpm deploy:staging` / `pnpm deploy:prod`
6. ローカルは `cp .dev.vars.example .dev.vars`（`WEBAUTHN_RP_ID=localhost` / `ORIGIN=http://localhost:5173` のまま可）→ `docker compose up`

`wrangler.jsonc` に秘密情報は無いので、変更をそのままフォークにコミットしてよい。
