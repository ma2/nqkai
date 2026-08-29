# SETUP — Cloudflare / GitHub の初期セットアップ

## 環境と URL

- アカウント `e1bfc1ed29f5c1f17e23a9d77a3fad8a`、リージョン APAC
- workers.dev サブドメイン = **`nqkai`**、Worker 名で環境を区別する

| 環境 | Worker 名 | URL | git ブランチ |
|------|-----------|-----|--------------|
| staging | `staging` | `https://staging.nqkai.workers.dev` | `dev` |
| production | `prod` | `https://prod.nqkai.workers.dev` | `main` |

## 状態

- ✅ Cloudflare リソース作成済み
  - D1: `nqkai-staging` (`1f1d1edc-1e83-40e9-97bb-55bbbbee4be3`) / `nqkai-prod` (`6084cfde-648d-45d6-be8c-26b83bd4b95c`)
  - KV: `nqkai-staging` (`3a75afdfe34c43d6a6d27b2dc5ce2c8d`) / `nqkai-prod` (`a9c1955eb227473a8faa0695301d2a0d`)
  - R2: `nqkai-staging` / `nqkai-prod`
  - （旧 `nqkai-dev` の D1/KV/R2 は未使用。空なので放置で可、気になれば削除）
- ✅ `wrangler.jsonc` に実 ID・URL 反映済み
- ⏳ **アカウントの workers.dev サブドメインを `nqkai` に変更**（下記 1）
- ⏳ リモート D1 マイグレーション（下記 2）
- ⏳ GitHub Secrets（下記 3）／ ブランチ保護（下記 4）
- ⏳ 初回デプロイ（下記 5）

## 1. workers.dev サブドメインの変更

ダッシュボード → Workers & Pages → 右側 **Account details** → Subdomain → `mckoy` を **`nqkai`** に変更。
アカウント全体の設定で、既存 Worker の URL も新サブドメインへ移る。

## 2. リモート D1 へマイグレーション適用

CI が毎デプロイで実行するが、初回は手動で流す（`wrangler login` 済みの端末で）。

```bash
pnpm db:migrate:staging   # = wrangler d1 migrations apply DB --env staging --remote
pnpm db:migrate:prod      # = wrangler d1 migrations apply DB --env production --remote
```

## 3. GitHub Secrets

リポジトリの Settings → Secrets and variables → Actions に登録する。

| 名前 | 値 |
|------|----|
| `CLOUDFLARE_ACCOUNT_ID` | `e1bfc1ed29f5c1f17e23a9d77a3fad8a` |
| `CLOUDFLARE_API_TOKEN` | Workers Scripts / D1 / R2 / Workers KV Storage の Edit 権限を持つ API トークン |

API トークンは Cloudflare ダッシュボード → My Profile → API Tokens → Create Token（"Edit Cloudflare Workers" テンプレートに D1 / R2 / KV の Edit を追加）。

## 4. ブランチ保護（`main`）

Settings → Branches → Add rule（`main`）:

- Require a pull request before merging
- Require status checks to pass（`ci` を必須に）
- Do not allow direct pushes

## 5. 初回デプロイ

サブドメイン変更・マイグレーション適用のあと、手動で初回デプロイ：

```bash
pnpm deploy:staging   # = CLOUDFLARE_ENV=staging react-router build && wrangler deploy
pnpm deploy:prod      # = CLOUDFLARE_ENV=production react-router build && wrangler deploy
```

以降は自動：

```
dev ブランチへ push        → GitHub Actions（deploy.yml）→ CLOUDFLARE_ENV=staging + wrangler deploy
dev → main の PR をマージ   → GitHub Actions（deploy.yml）→ CLOUDFLARE_ENV=production + wrangler deploy
```

各ジョブは `typecheck → lint → test → build → d1 migrations apply --remote → deploy` の順。
`@cloudflare/vite-plugin` はビルド時の `CLOUDFLARE_ENV` で env を選ぶため、`wrangler deploy` に `--env` は付けない。

## 6. システム管理者の付与

登録フロー（パスキー作成）でユーザーを作った後に付与する。

```bash
pnpm admin:grant you@example.com                  # ローカル
pnpm admin:grant you@example.com --env staging    # staging
pnpm admin:grant you@example.com --env production # production
```
