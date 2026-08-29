# SETUP — Cloudflare / GitHub の初期セットアップ

## 状態

- ✅ Cloudflare リソース作成済み（アカウント `e1bfc1ed29f5c1f17e23a9d77a3fad8a`、リージョン APAC）
  - D1: `nqkai-dev` (`2a9d30cb-5ffc-4621-81d7-dbd8f42cdca7`) / `nqkai-prod` (`6084cfde-648d-45d6-be8c-26b83bd4b95c`)
  - KV: `nqkai-dev` (`ba845020976d4aefb7bd2ee18ce29b14`) / `nqkai-prod` (`a9c1955eb227473a8faa0695301d2a0d`)
  - R2: `nqkai-dev` / `nqkai-prod`
- ✅ `wrangler.jsonc` に実 ID 反映済み
- ⏳ リモート D1 マイグレーション（下記 2）
- ⏳ GitHub Secrets（下記 3）／ ブランチ保護（下記 4）
- ⏳ 初回デプロイ後に `WEBAUTHN_*` を実 URL へ更新（下記 5）

## 1. （参考）リソース作成コマンド

作成済み。再作成や別アカウントで立てる場合の参考。

```bash
pnpm exec wrangler d1 create nqkai-dev  && pnpm exec wrangler d1 create nqkai-prod
pnpm exec wrangler kv namespace create nqkai-dev && pnpm exec wrangler kv namespace create nqkai-prod
pnpm exec wrangler r2 bucket create nqkai-dev && pnpm exec wrangler r2 bucket create nqkai-prod
```

出力の `database_id` / KV `id` を `wrangler.jsonc` の該当 env に差し込む。

## 2. リモート D1 へマイグレーション適用

CI が毎デプロイで実行するが、初回は手動で流す（`wrangler login` 済みの端末で）。

```bash
pnpm db:migrate:dev    # = wrangler d1 migrations apply DB --env dev --remote
pnpm db:migrate:prod   # = wrangler d1 migrations apply DB --env production --remote
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

## 5. デプロイと WEBAUTHN_* の確定

初回は手動デプロイして払い出される URL を確認する。

```bash
pnpm deploy:dev    # = CLOUDFLARE_ENV=dev react-router build && wrangler deploy
```

表示された `https://nqkai-dev.<subdomain>.workers.dev` に合わせて `wrangler.jsonc` の
`env.dev.vars.WEBAUTHN_RP_ID` と `WEBAUTHN_ORIGIN` を更新し、再度 `pnpm deploy:dev`。
（production も同様に `pnpm deploy:prod` と `env.production.vars` を更新）

以降は自動：

```
dev ブランチへ push        → GitHub Actions（deploy.yml）→ CLOUDFLARE_ENV=dev + wrangler deploy
dev → main の PR をマージ   → GitHub Actions（deploy.yml）→ CLOUDFLARE_ENV=production + wrangler deploy
```

各ジョブは `typecheck → lint → test → build → d1 migrations apply --remote → deploy` の順。
`@cloudflare/vite-plugin` はビルド時の `CLOUDFLARE_ENV` で env を選ぶため、`wrangler deploy` に `--env` は付けない。

## 6. システム管理者の付与

登録フロー（パスキー作成）でユーザーを作った後に付与する。

```bash
pnpm admin:grant you@example.com                  # ローカル
pnpm admin:grant you@example.com --env dev        # dev
pnpm admin:grant you@example.com --env production # production
```
