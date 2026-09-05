# nQkai 仕様書 Ver1.2.0

**nQkai**（エヌキューカイ）は、オンラインで句会（くかい）を開催・管理できる Web アプリケーション。結社（けっしゃ）機能を持ち、パスキー認証によるセキュアなユーザー管理を行う。

- 表示名・プロダクト名は **nQkai**。
- インフラ上の識別子（GitHub リポジトリ、Worker 名、D1 / R2 / KV 名、`wrangler.jsonc` の `name`）は小文字の **`nqkai`**（`workers.dev` サブドメイン等が小文字前提のため）。

本書は要件定義・アーキテクチャ設計・データモデル・API設計・開発ロードマップを1ファイルに集約したものである。旧 `requirements.md` / `roadmap.md` / `er_diagram.puml` の内容は本書に統合されている。

---

## 目次

1. 用語
2. 技術スタック
3. アーキテクチャ
4. プロジェクト構成
5. 認証・セッション設計
6. 権限モデル
7. データモデル
8. 句会のフェーズと進行
9. 機能仕様
10. API設計
11. フロントエンド設計
12. 非機能要件
13. Rails版からの変更点
14. スコープ外・将来課題
15. 開発ロードマップ
16. 開発環境・コマンド
17. テスト戦略

---

## 1. 用語

| 用語 | 読み | 説明 |
|------|------|------|
| 結社 | けっしゃ | 俳句サークル。ユーザーが所属する組織単位 |
| 句会 | くかい | 俳句を持ち寄り互選する会。結社に紐づいて開催される |
| 俳号 | はいごう | ユーザーが句会で用いるニックネーム（1つ） |
| 兼題 | けんだい | 句会のテーマ（お題） |
| 投句 | とうく | 句会に俳句を提出すること／提出された句 |
| 選句 | せんく | 他者の句を選ぶこと |
| 特選・並選・逆選 | とくせん・なみせん・ぎゃくせん | 選句の種別。特選＝高評価、並選＝評価、逆選＝マイナス評価 |
| 互選 | ごせん | 参加者同士で選び合うこと |
| ゲスト参加者 | | 結社に属さず、ゲストコードで句会に参加する参加者。コードを持てば複数の句会に並行して参加できる |

---

## 2. 技術スタック

| 分類 | 採用技術 |
|------|----------|
| 実行環境 | Cloudflare Workers（単一 Worker）。staging / production の 2 環境（「3.2」） |
| 言語 | TypeScript |
| アプリフレームワーク | React Router v8（framework mode）。SSR + ネストルーティング + loader / action |
| ビルド | Vite + `@react-router/dev`（Cloudflare プリセット） |
| UI ライブラリ | React |
| データベース | Cloudflare D1（SQLite） |
| ORM / マイグレーション | Drizzle ORM + drizzle-kit |
| オブジェクトストレージ | Cloudflare R2（プロフィール画像） |
| KV（短命データ） | Cloudflare KV（WebAuthn チャレンジ、レート制限カウンタ） |
| 認証 | パスキー（WebAuthn）。`@simplewebauthn/server` + `@simplewebauthn/browser` |
| セッション | HttpOnly Cookie + D1 セッションテーブル（サーバ側でオペーク・トークンを検証） |
| CSS | Tailwind CSS |
| バリデーション / 型共有 | Zod（`app/lib` に置き、loader/action・フォームで共有） |
| Lint / Format | Biome |
| 単体・結合テスト | Vitest + `@cloudflare/vitest-pool-workers` |
| E2E テスト | Playwright |
| デプロイ | GitHub Actions → Wrangler（`dev` push → dev、`main` push → production） |
| ローカル開発 | Docker（`docker compose`）上の `react-router dev` + ローカル D1/R2/KV エミュレーション |

### なぜ React Router v8（framework mode）か

- 想定規模が小さい（「12.2」）ため、性能ではなく**部品数の少なさ**でスタックを選ぶ。
- 独立した JSON API + SPA + データ取得ライブラリの三層を、**loader（サーバ読み取り）/ action（サーバ書き込み）/ 自動再検証**に畳める。TanStack Query 相当は不要。
- 公開ページ（`/u/:publicId` の個人俳句一覧、終了したパブリック句会）が **SSR** で共有・インデックス可能になる。
- Cloudflare Workers を公式サポート。`getLoadContext` で D1 / R2 / KV バインディングを loader / action へ渡す。
- fetch 駆動が必要な口（WebAuthn セレモニー、ポーリング、ファイルダウンロード、画像配信）だけ **リソースルート**（コンポーネントを持たず `Response` を返すルート）で用意する。

> バックエンドの細部（Drizzle / セッション方式 / WebAuthn ライブラリ等）は、実装着手時に再確認する前提の「たたき台」である。

### 採用しないもの（明確な非採用）

- **メール送信基盤**：結社参加は Web 上の申請 → オーナー承認で完結させる。承認・却下・フェーズ変更などの通知は**アプリ内通知のみ**。
- **リアルタイム更新（WebSocket / Durable Objects / SSE）**：フェーズ状態は**軽いポーリング**で画面へ反映する。
- **フェーズ自動遷移（Cron Triggers / DO Alarm）**：フェーズ遷移は**主催者の手動操作のみ**。時刻設定は「目安」として保持・表示する。
- **サーバサイドの PDF 生成**：Workers の制約により当面スコープ外。エクスポートはテキスト / CSV のみ。縦書きは画面表示（CSS）で対応する。

---

## 3. アーキテクチャ

### 3.1 全体像

```
                 ┌─────────────────────────── Cloudflare Worker ────────────────────────────┐
 ブラウザ ──────▶│  workers/app.ts  … React Router リクエストハンドラ                        │
                  │    │  getLoadContext で D1 / R2 / KV を loader・action へ注入             │
                  │    ├─ ページルート    … loader（読み取り）/ action（書き込み）/ SSR      │
                  │    │                     初回は HTML を返し、以降はクライアント遷移       │
                  │    ├─ リソースルート  … /api/*（WebAuthn・ポーリング・DL・画像配信）      │
                  │    └─ 静的アセット    … Vite ビルド成果物（RR が配信）                    │
                  │                                                                          │
                  │   バインディング:  DB (D1)   BUCKET (R2)   KV (KV)                        │
                  └──────────────────────────────────────────────────────────────────────────┘
```

- **1 Worker がアプリ全体**。React Router の `createRequestHandler` を Worker の `fetch` にぶら下げ、`RouterContextProvider` に Cloudflare バインディング（`env` / `ctx`）を積んで渡す。フロントとバックの境界は「ルートモジュール内の server 関数（loader/action）」と「client コンポーネント」。
- データの流れ：
  - **読み取り** … 各ルートの `loader`（Worker 上で実行）が Drizzle で D1 を直接引く。クライアント遷移時は RR がバックグラウンドで loader を再実行。
  - **書き込み** … `<Form>` / `useFetcher` → ルートの `action`（Worker 上で実行）。完了後、RR が同一ページの loader を自動再検証する。
  - **fetch 駆動の口** … WebAuthn セレモニー、句会状態のポーリング、エクスポートのダウンロード、画像配信のみ `/api/*` の**リソースルート**で提供。
- リクエスト／レスポンスと入力の型は `app/lib` の Zod スキーマから導出し、action の検証とフォーム側の検証で共有する。
- ドメインロジックは `app/server/services/*.server.ts` に集約し、loader / action は「入力検証 → サービス呼び出し → 整形」に徹する。
- 認証・権限は loader / action から呼ぶ `getAuth()` / `requireAuth()` ヘルパ（`*.server.ts`）に集約。共通の前処理が増えたら React Router v8 の middleware に切り出す。

### 3.2 環境

| 環境 | 実行場所 | デプロイのトリガー | D1 / R2 / KV | 用途 |
|------|----------|--------------------|--------------|------|
| local | Docker（`docker compose`）上の `react-router dev` | 手動（`docker compose up`） | Miniflare のローカルエミュレーション（状態は名前付きボリュームで永続化） | 開発 |
| staging | Cloudflare Workers（Worker 名 `nqkai-staging` → `https://nqkai-staging.mckoy.workers.dev`） | **`dev` ブランチへの push** | `nqkai-staging`（D1 / R2 / KV） | 結合確認・動作検証 |
| production | Cloudflare Workers（Worker 名 `nqkai-prod` → `https://nqkai-prod.mckoy.workers.dev`） | **`main` ブランチへの push**（`dev` からのマージ） | `nqkai-prod`（D1 / R2 / KV） | 本番 |

- Cloudflare 側の環境分離は Wrangler の environments（`wrangler.jsonc` の `env.staging` / `env.production`）で行う。アカウントの workers.dev サブドメインは `mckoy`（他アプリと共有・変更しない）、Worker 名（`nqkai-staging` / `nqkai-prod`）で環境を区別する。ビルド時に `CLOUDFLARE_ENV=staging|production` を与えて `build/server/wrangler.json` に対象 env を焼き込み、`wrangler deploy`（`--env` なし）でデプロイする。ローカルからは `pnpm deploy:staging` / `pnpm deploy:prod`。
- **各環境は独立した D1 データベース・R2 バケット・KV 名前空間・シークレットを持つ。** 環境間でデータは共有しない。名前付き env はバインディングを継承しないため、各 env に明示的に再宣言する。
- ローカル（Docker）は常に Miniflare のローカルエミュレーションで動かし、`--remote` は使わない。リモートの D1/R2/KV に触れるのは CI からのみ。
- シークレット（`SESSION_SIGNING_KEY`、WebAuthn RP 設定など）は環境ごとに一度だけ `wrangler secret put --env <env>` で登録する。CI では触らない。ローカルは `.dev.vars`（Git 管理外）。

### 3.3 ブランチ運用と CI/CD

```
 dev ブランチで開発
   └─ push ──▶ GitHub Actions ──▶ CLOUDFLARE_ENV=staging pnpm build && wrangler deploy   （nqkai-staging.mckoy.workers.dev へ）
        │
        └─ PR: dev ─▶ main（レビュー・確認後にマージ）
              └─ push(main) ──▶ GitHub Actions ──▶ CLOUDFLARE_ENV=production pnpm build && wrangler deploy   （nqkai-prod.mckoy.workers.dev へ）
```

- `main` への直接 push は行わない（ブランチ保護。`dev` からの PR マージのみ）。
- ワークフロー `.github/workflows/deploy.yml` は `on: push: branches: [dev, main]`。ジョブ全体で環境変数 `CLOUDFLARE_ENV`（`main` なら `production`、それ以外＝`dev` ブランチは `staging`）を設定し、手順は共通：

  1. `pnpm install --frozen-lockfile`
  2. `pnpm typecheck` / `pnpm lint` / `pnpm test`（いずれか失敗ならデプロイしない）
  3. `pnpm build` … `CLOUDFLARE_ENV` により `build/server/wrangler.json` に対象 env のバインディングが焼き込まれる
  4. `pnpm exec wrangler d1 migrations apply DB --env "$CLOUDFLARE_ENV" --remote`（マイグレーション先行適用）
  5. `pnpm exec wrangler deploy` … 焼き込み済み設定を使うため `--env` は付けない

> `@cloudflare/vite-plugin` はビルド時の `CLOUDFLARE_ENV` で `wrangler.jsonc` の `env.*` を選ぶ。`--env` を付けたビルドではなく、環境変数で env を切り替える点に注意。

- **マイグレーションは後方互換（加算的変更）を原則**とし、デプロイ前に適用しても新旧どちらのコードでも動くようにする。列の削除・リネームは複数リリースに分割する。
- GitHub Secrets：`CLOUDFLARE_API_TOKEN`（Workers Scripts / D1 / R2 / KV の編集権限）、`CLOUDFLARE_ACCOUNT_ID`。

---

## 4. プロジェクト構成

```
/
├─ CLAUDE.md                     Claude Code 向けガイド
├─ SPEC.md                       本仕様書
├─ package.json
├─ pnpm-lock.yaml
├─ wrangler.jsonc                Worker 設定・env.staging / env.production（DB / BUCKET / KV）
├─ react-router.config.ts        RR 設定（ssr: true、Cloudflare プリセット）
├─ vite.config.ts               @react-router/dev + Cloudflare plugin
├─ tsconfig.json
├─ tailwind.config.ts
├─ biome.json
├─ drizzle.config.ts
├─ Dockerfile.dev                ローカル開発用イメージ
├─ docker-compose.yml            ローカル開発（app サービス、.wrangler / node_modules ボリューム）
├─ .dev.vars.example             ローカル用シークレットの雛形（実体 .dev.vars は Git 管理外）
├─ .github/workflows/deploy.yml  dev push → dev、main push → production
├─ migrations/                   drizzle-kit が生成する D1 マイグレーション SQL
├─ workers/
│  └─ app.ts                     Worker エントリ（RR ハンドラ + getLoadContext でバインディング注入）
├─ app/
│  ├─ root.tsx                   ルートレイアウト（<html>、エラーバウンダリ、通知ベル）
│  ├─ routes.ts                  ルート定義
│  ├─ routes/                    ルートモジュール（loader / action / default コンポーネント）
│  │  ├─ _index.tsx              ダッシュボード
│  │  ├─ orgs.$orgId.tsx         結社詳細            ほか画面ルート
│  │  ├─ kukai.$kukaiId.tsx      句会トップ（フェーズ別 UI）
│  │  ├─ kukai.$kukaiId.select.tsx  選句シート
│  │  ├─ api.auth.$.ts           WebAuthn セレモニー（リソースルート）
│  │  ├─ api.kukai.$kukaiId.state.ts  ポーリング用の軽量状態（リソースルート）
│  │  ├─ api.avatars.$userId.ts  R2 から画像を stream（リソースルート）
│  │  └─ api.kukai.$kukaiId.export.ts  テキスト / CSV ダウンロード（リソースルート）
│  ├─ server/                    サーバ専用（*.server.ts のみ）
│  │  ├─ db/schema.ts            Drizzle スキーマ定義
│  │  ├─ db/client.server.ts     drizzle(env.DB) の生成
│  │  ├─ auth.server.ts          getAuth() / セッション発行・破棄 / WebAuthn
│  │  ├─ authz.server.ts         権限判定（ロール・フェーズ・所有者チェック）
│  │  ├─ ratelimit.server.ts     KV レートリミッタ
│  │  └─ services/               ドメインロジック（フェーズ遷移・集計・CSV・エクスポート …）
│  ├─ components/                汎用 UI（縦書きコンポーネント含む）
│  ├─ features/                  機能単位のコンポーネント群
│  ├─ hooks/                     useKukaiStatePolling など
│  ├─ lib/                       Zod スキーマ・型・定数・enum（サーバ / クライアント共有）
│  └─ styles/                    Tailwind エントリ、縦書きユーティリティ
├─ test/
│  ├─ server/                    Vitest（vitest-pool-workers）：loader / action / services
│  └─ e2e/                       Playwright
└─ public/                       favicon 等の静的ファイル
```

- `*.server.ts` と `app/server/` 配下は RR のバンドラがクライアントバンドルから除外する。D1 / R2 / KV アクセスや秘密情報はここに閉じ込める。
- `app/lib` は両側から import される。Zod スキーマ・enum・純粋関数のみを置き、サーバ専用の依存を持ち込まない。

---

## 5. 認証・セッション設計

### 5.1 パスキー（WebAuthn）

- ユーザー登録は必須。ID/パスワードは持たず、認証子（パスキー）のみで認証する。
- ライブラリ：サーバ `@simplewebauthn/server`、ブラウザ `@simplewebauthn/browser`。
- RP 設定は環境変数（`WEBAUTHN_RP_ID`, `WEBAUTHN_RP_NAME`, `WEBAUTHN_ORIGIN`）。

WebAuthn セレモニーは `@simplewebauthn/browser` から fetch で叩くため、`/api/auth/*` の**リソースルート**（`app/routes/api.auth.$.ts`）として実装する。

#### 登録フロー（新規ユーザー）

1. `POST /api/auth/register/options` … メールアドレス・俳号を受け取り、`generateRegistrationOptions()` を実行。チャレンジを KV に `reg:<tempId>` で TTL 5分保存し、`tempId` を返す。
2. ブラウザで `startRegistration()`。
3. `POST /api/auth/register/verify` … `tempId` と attestation を受け取り `verifyRegistrationResponse()`。成功したら `users` と `webauthn_credentials` を作成し、セッションを発行。

#### 認証子の追加（既存ユーザー）

- ログイン済みユーザーが端末ごとにパスキーを追加できる。`POST /api/auth/credentials/options` → `POST /api/auth/credentials/verify`。
- 1ユーザーが複数の認証子を持てる。認証子には任意の表示名（例：「iPhone」）を付けられる。最後の1つは削除不可。

#### 複数パスキーの推奨（端末紛失対策の第一線）

- 登録完了直後と、認証子が 1 個しかない状態でログインした際に、**2 個目のパスキー登録を促すバナー**を出す（「別の端末（PC・タブレット）にも登録しておくと、機種変や紛失のときに安心です」）。
- 設定画面の「パスキー」セクションで、認証子が 1 個のときは注意表示を出す。
- 端末を失っても他のパスキーでログインできれば復旧は不要。それでも全て失った場合の最終手段が「5.5 アカウント復旧」。

#### ログインフロー

1. `POST /api/auth/login/options` … メールアドレス（任意。省略時は discoverable credential を許可）を受け取り `generateAuthenticationOptions()`。チャレンジを KV に保存。
2. ブラウザで `startAuthentication()`。
3. `POST /api/auth/login/verify` … `verifyAuthenticationResponse()`。`counter` を更新し、セッションを発行。

### 5.2 セッション

- ログイン成功時、ランダム 32 バイトのトークンを生成。**ハッシュ（SHA-256）を `sessions.id` に保存**し、生トークンを Cookie で配布する。
- Cookie 名：`__Host-session`。属性：`Secure; HttpOnly; SameSite=Lax; Path=/`。
- 有効期限：発行から 30 日（`sessions.expires_at`）。アクセスごとにスライド延長（残り 7 日を切ったら再発行）。
- loader / action から呼ぶ `getAuth(db, request)` が Cookie → `sessions` → `users`（会員）またはゲストコンテキストを解決して返す。認証必須ルートでは `requireAuth()` が未解決時に `/login` へ `redirect`、権限不足は 403 を throw する。共通前処理が増えたら React Router v8 の middleware に移す。
- ログアウトは該当セッション行を削除。「全端末からログアウト」で当該ユーザーの全セッションを削除。

### 5.3 ゲストセッション

- ゲストセッションは1つのブラウザ（ゲスト個人）を表す。`sessions.user_id` は NULL、`sessions.kind = 'guest'` とする。
- **1つのゲストセッションに複数の `guest_participants` を紐づけられる**（句会ごとに1行）。`guest_participants.session_id` がセッションを指す。
- ゲストコードで新しい句会に参加すると、既存のゲストセッションはそのまま維持し、当該句会用の `guest_participant` を追加する。ゲストセッションが無ければ新規発行する。
- リクエストのゲスト権限は**パスの `:kukaiId` で絞り込む**。`session_id` と `kukai_id` の組で `guest_participant` を引き、その句会の権限（`can_submit` 等）を適用する。参加していない句会に対する操作は 403。
- ゲストがアクセスできるのは、自分が参加している句会のスコープ（句会トップ・投句・選句・結果・コメント）に限る。ダッシュボードや結社管理などの会員向け画面へはアクセスできない。
- ゲストセッションの有効期限は、紐づく `guest_participants` が参照するゲストコードの有効期限（発行から3ヶ月）のうち**最も遅いもの**を上限とする。個々の句会のアクセス可否は当該コードの有効期限・失効状態で判定する。

### 5.4 システム管理者

- `users.is_system_admin = true` のユーザー。付与は `pnpm admin:grant <email> [--env …]` スクリプト（`wrangler d1 execute` で該当行を更新）で行う。UI 上の昇格導線は持たない。
- **運用要件**：システム管理者は常に 2 名以上とし、各自が 2 個以上のパスキーを登録する（相互に「5.5」で復旧できるようにするため）。

### 5.5 アカウント復旧（管理者仲介 / 案D）

全パスキーを失ってログインできなくなった会員を、**その会員が所属する結社の管理者、またはシステム管理者が発行する一回限りの「再登録コード」で復旧**する。俳句人口は年配層が多く、機種変や端末紛失で締め出される事故が起きやすいため、パスキーのみ運用にこの回復導線を必須で組み込む。メール送信基盤は使わない（結社という「互いを知る」組織構造に本人確認を委ねる）。

#### 5.5.1 データ

`account_recovery_codes`（「7.2」に定義）を追加する。生コードは保存せず SHA-256 ハッシュのみ保持。1 ユーザーにつき有効な（未使用・未失効）コードは 1 件のみ（再発行で前のものを失効）。

#### 5.5.2 フロー

1. **復旧依頼（未認証）**：ログイン画面の「パスキーを使えない場合」→ メールアドレスを入力。
   - そのメールのユーザーが実在し、かつ `status = 'open'` の結社に 1 つ以上所属していれば、`recovery_requests`（「7.2」）を作成し、当該結社の管理者・副管理者へアプリ内通知。
   - メールの実在有無は返答で明かさない（常に「依頼を受け付けました。管理者の対応をお待ちください」）。KV でレート制限（IP + メール）。
   - 所属結社が無い会員は依頼できない → 画面にシステム管理者への連絡導線（問い合わせ先）を表示する（**運用でカバーする既知の制約**）。

2. **発行（結社管理画面）**：「パスキー復旧依頼」一覧、または任意メンバーの行から「復旧コードを発行」。
   - 管理者は対象の**俳号と登録メールアドレスを画面で確認**し、電話・LINE・対面など**アプリ外で本人であることを確かめる**（社会的な本人確認）。
   - 発行すると、人が読める形式のコード（例：`ABCD-EFGH-JKMN`、8〜12 文字の base32、紛らわしい文字を除外）を**その場で一度だけ管理者に表示**。管理者がアプリ外で会員へ渡す。サーバはハッシュのみ保存。
   - `issued_by` / `organization_id` / `issued_via`（`organization_admin` / `system_admin`）/ `expires_at`（発行から 24 時間）を記録。
   - **同じ結社の他の管理者・副管理者にアプリ内通知**（サイレントな操作にしない）。システム管理者は全発行イベントを閲覧可能。

3. **再登録（未認証）**：ログイン画面の「復旧コードでパスキーを再登録」→ メールアドレス + コードを入力。
   - サーバが `code_hash` 一致・未失効・未使用・ユーザー一致を検証。失敗は一律「コードが無効です」。試行はレート制限。
   - 成功したら **WebAuthn 登録セレモニー**（`credentials/*` と同じ）を実行し、新しい `webauthn_credentials` を当該ユーザーに追加。`used_at` を記録し、**当該ユーザーの既存セッションを全て失効**。新規セッションを発行。
   - 既存の（紛失したはずの）パスキーは自動削除しない（端末が戻る可能性）。再登録後の画面で「古いパスキーの整理」と「2 個目の登録」を促す。
   - 発行元の結社管理者・副管理者、およびシステム管理者へ「復旧コードが使用されました」のアプリ内通知（乱用の検知可能性を担保）。

#### 5.5.3 権限

| 発行できる人 | 対象 |
|--------------|------|
| システム管理者 | 全ユーザー |
| 結社管理者・副管理者（`status = 'open'` の結社のみ） | その結社の現メンバー |

- 閉鎖結社（`status = 'closed'`）の管理者は発行不可（「閉鎖された結社の句会は閲覧不可」と整合）。対象会員はシステム管理者にフォールバック。
- 対象ユーザーが `suspended` の場合は発行不可。

#### 5.5.4 セキュリティ上の注意

- **悪意ある管理者**が自分でコードを発行・使用して会員のアカウントを乗っ取るリスクが残る。緩和策：
  - 全発行・使用イベントを監査ログに残す（`issued_by`、`used_at`、使用時の IP / UA）。
  - 発行・使用時に他の管理者へ通知（サイレント化させない）。
  - 復旧コードでできるのは「パスキーの追加」のみ。メール変更・退会・権限操作はできない。コードは 1 ユーザーに束縛、24 時間・単回使用。
  - 最終的には「管理者は結社内で信頼されている」前提と、監査による事後追跡で受容する残存リスクとする。
- システム管理者が全員締め出された場合の最終手段（break-glass）：`wrangler d1 execute` で直接 `webauthn_credentials` を投入するか `account_recovery_codes` を発行する運用スクリプト。だからこそ「5.4」の運用要件（2 名以上・各 2 パスキー）を守る。

---

## 6. 権限モデル

### 6.1 ロール一覧

| ロール | 保持場所 | 説明 |
|--------|----------|------|
| システム管理者 | `users.is_system_admin` | 全結社・全句会の閲覧・管理、コンテンツ削除、アカウント停止・削除 |
| 一般ユーザー | 既定 | 登録済みユーザー。結社の作成・参加申請、句会の主催が可能 |
| 結社管理者（オーナー） | `organization_memberships.role = 'admin'` | 結社の全権。参加申請の承認、メンバー・副管理者管理、句会の論理削除・復活、結社の閉鎖 |
| 結社副管理者 | `organization_memberships.role = 'deputy_admin'` | 結社情報の編集、参加申請の承認、メンバー管理。結社の閉鎖と副管理者の任免は不可 |
| 結社メンバー | `organization_memberships.role = 'member'` | 結社の句会に参加、句会の主催 |
| 句会主催者 | `kukai.organizer_id` | 当該句会のフェーズ制御、設定変更、不適切句の非表示、ゲストコード発行、句会の削除 |
| ゲスト参加者 | `guest_participants` | ゲストコードの許可範囲（投句／選句／コメント）で当該句会に参加 |

- 結社作成者は自動的にその結社の管理者になる。
- 管理者は常に 1 名以上必要（最後の管理者は降格・退会不可。委譲してから行う）。
- 副管理者の人数上限なし。メンバー数上限なし。

### 6.2 主要操作の権限表

| 操作 | システム管理者 | 結社管理者 | 副管理者 | メンバー | 句会主催者 | ゲスト |
|------|:---:|:---:|:---:|:---:|:---:|:---:|
| 結社の作成 | ✓ | — | — | ✓（誰でも） | — | — |
| 結社情報の編集 | ✓ | ✓ | ✓ | — | — | — |
| 参加申請の承認／却下 | ✓ | ✓ | ✓ | — | — | — |
| メンバーの強制退会 | ✓ | ✓ | ✓ | — | — | — |
| 副管理者の任免 | ✓ | ✓ | — | — | — | — |
| 結社の閉鎖 | ✓ | ✓ | — | — | — | — |
| 句会の作成 | ✓ | ✓ | ✓ | ✓ | — | — |
| 句会設定の変更 | ✓ | — | — | — | ✓ | — |
| フェーズの進行・巻き戻し・延長 | ✓ | — | — | — | ✓ | — |
| 句の非表示設定 | ✓ | — | — | — | ✓ | — |
| 句会の論理削除・復活 | ✓ | ✓ | ✓ | — | ✓（自句会） | — |
| ゲストコードの発行・失効 | ✓ | — | — | — | ✓ | — |
| パスキー復旧コードの発行（「5.5」） | ✓（全員） | ✓（現メンバー） | ✓（現メンバー） | — | — | — |
| 投句 | — | 参加者として | 参加者として | 参加者として | 参加者として | 許可時のみ |
| 選句 | — | 参加者として | 参加者として | 参加者として | 参加者として | 許可時のみ |
| コメント | — | 参加者として | 参加者として | 参加者として | 参加者として | 許可時のみ |
| 自分の投句の削除 | ✓ | — | — | 自句のみ | 自句のみ | 締切前の自句のみ |

権限判定は `app/server/authz.server.ts` に集約し、loader / action から宣言的に呼び出す。

---

## 7. データモデル

### 7.1 ER 図

```
User ||--o{ WebauthnCredential
User ||--o{ Session
User ||--o{ OrganizationMembership
User ||--o{ OrganizationJoinRequest
User ||--o{ Notification
User ||--o{ RecoveryRequest : "パスキー復旧依頼"
User ||--o{ AccountRecoveryCode : "再登録コード（対象）"
User ||--o{ AccountRecoveryCode : "issued_by（発行者）"
User ||--o{ Kukai : "organizes"
User ||--o{ Submission : "authors (member)"
User ||--o{ Selection : "selects (member)"
User ||--o{ Comment  : "writes (member)"

Organization ||--o{ OrganizationMembership
Organization ||--o{ OrganizationJoinRequest
Organization ||--o{ RecoveryRequest : "依頼の回送先"
Organization ||--o{ Kukai : "hosts"

Kukai ||--o{ Submission
Kukai ||--o{ GuestCode
Kukai ||--o{ GuestParticipant
Kukai ||--o{ KukaiPhaseEvent
Kukai ||--o{ CsvImport (via Organization)

GuestCode ||--o{ GuestParticipant
Session ||--o{ GuestParticipant : "1ゲストセッションで複数句会に参加"
GuestParticipant ||--o{ Submission : "authors (guest)"
GuestParticipant ||--o{ Selection  : "selects (guest)"
GuestParticipant ||--o{ Comment    : "writes (guest)"

Submission ||--o{ Selection
Submission ||--o{ Comment
```

### 7.2 テーブル定義

すべての主キーは `TEXT`（`crypto.randomUUID()` の v4）。時刻は UNIX ミリ秒の `INTEGER`（Drizzle `integer({ mode: 'timestamp_ms' })`）。真偽値は `INTEGER`（0/1）。

#### users（ユーザー）

| カラム | 型 | 説明 |
|--------|----|----|
| id | TEXT PK | UUID |
| public_id | TEXT UNIQUE | 個人俳句一覧の公開 URL 用の推測困難なトークン |
| email | TEXT UNIQUE | ログイン識別子。表示には使わない |
| haigo | TEXT | 俳号（表示名）。1人1つ |
| avatar_key | TEXT NULL | R2 のオブジェクトキー |
| is_system_admin | INTEGER | システム管理者フラグ |
| status | TEXT | `active` / `suspended`（システム管理者による停止） |
| created_at / updated_at | INTEGER | |

#### webauthn_credentials（認証子）

| カラム | 型 | 説明 |
|--------|----|----|
| id | TEXT PK | credential ID（base64url） |
| user_id | TEXT FK → users | |
| public_key | BLOB | COSE 公開鍵 |
| counter | INTEGER | 署名カウンタ |
| transports | TEXT | JSON 配列文字列 |
| device_name | TEXT NULL | ユーザー設定の表示名 |
| created_at / last_used_at | INTEGER | |

#### sessions（セッション）

| カラム | 型 | 説明 |
|--------|----|----|
| id | TEXT PK | セッショントークンの SHA-256 ハッシュ |
| kind | TEXT | `member` / `guest` |
| user_id | TEXT NULL FK → users | 会員セッション（`kind = 'member'` のとき非 NULL） |
| user_agent | TEXT NULL | |
| created_at | INTEGER | |
| expires_at | INTEGER | |

制約：`kind = 'member'` なら `user_id` は非 NULL。`kind = 'guest'` なら `user_id` は NULL で、参加句会は `guest_participants.session_id` から引く（1セッションに複数句会可）。

#### organizations（結社）

| カラム | 型 | 説明 |
|--------|----|----|
| id | TEXT PK | UUID（公開 URL に使用） |
| name | TEXT | |
| description | TEXT | |
| image_key | TEXT NULL | R2 のオブジェクトキー（結社の画像。任意） |
| status | TEXT | `open` / `closed` |
| created_by | TEXT FK → users | |
| created_at / updated_at | INTEGER | |
| closed_at | INTEGER NULL | |

#### organization_memberships（所属）

| カラム | 型 | 説明 |
|--------|----|----|
| id | TEXT PK | |
| organization_id | TEXT FK → organizations | |
| user_id | TEXT FK → users | |
| role | TEXT | `admin` / `deputy_admin` / `member` |
| joined_at | INTEGER | |
| created_at / updated_at | INTEGER | |

制約：`UNIQUE(organization_id, user_id)`。

#### organization_join_requests（参加申請）

| カラム | 型 | 説明 |
|--------|----|----|
| id | TEXT PK | |
| organization_id | TEXT FK → organizations | |
| user_id | TEXT FK → users | |
| message | TEXT NULL | 申請メッセージ |
| status | TEXT | `pending` / `approved` / `rejected` / `withdrawn` |
| decided_by | TEXT NULL FK → users | |
| decided_at | INTEGER NULL | |
| created_at | INTEGER | |

制約：`UNIQUE(organization_id, user_id)` where `status = 'pending'`（部分ユニーク、= 同時に複数の保留申請を作れない）。

#### kukai（句会）

| カラム | 型 | 説明 |
|--------|----|----|
| id | TEXT PK | UUID（公開 URL に使用） |
| organization_id | TEXT FK → organizations | |
| organizer_id | TEXT FK → users | 主催者 |
| name | TEXT | |
| description | TEXT | |
| theme | TEXT | 兼題 |
| submissions_per_user | INTEGER | 一人当たり投句数 |
| special_count / regular_count / reverse_count | INTEGER | 特選・並選・逆選の選句数 |
| special_points / regular_points / reverse_points | INTEGER | 各選の点数（逆選は負値を想定） |
| allow_guest | INTEGER | ゲスト参加の可否 |
| guest_can_submit / guest_can_select / guest_can_comment | INTEGER | ゲスト権限の既定値 |
| visibility | TEXT | `public` / `private` |
| phase | TEXT | 「8. フェーズ」参照 |
| scheduled_submission_start_at / _end_at | INTEGER NULL | 目安時刻（自動遷移はしない） |
| scheduled_selection_start_at / _end_at | INTEGER NULL | 同上 |
| scheduled_result_at | INTEGER NULL | 同上 |
| scheduled_comment_start_at / _end_at | INTEGER NULL | 同上 |
| authors_revealed_at | INTEGER NULL | 作者公開した時刻（NULL＝未公開） |
| deleted_at | INTEGER NULL | 論理削除 |
| deleted_by | TEXT NULL FK → users | |
| source_import_id | TEXT NULL FK → csv_imports | CSV 一括登録由来の句会 |
| created_at / updated_at | INTEGER | |

#### guest_codes（ゲストコード）

| カラム | 型 | 説明 |
|--------|----|----|
| id | TEXT PK | |
| kukai_id | TEXT FK → kukai | |
| code | TEXT UNIQUE | 参加用コード（推測困難な文字列） |
| max_uses | INTEGER NULL | 使用上限（NULL＝無制限） |
| used_count | INTEGER | 発行済みゲスト数 |
| expires_at | INTEGER | 発行時刻 + 3ヶ月 |
| created_by | TEXT FK → users | |
| created_at | INTEGER | |
| revoked_at | INTEGER NULL | 失効時刻 |

#### guest_participants（ゲスト参加者）

| カラム | 型 | 説明 |
|--------|----|----|
| id | TEXT PK | |
| session_id | TEXT FK → sessions | 参加者が属するゲストセッション（ブラウザ）。1セッションが複数句会の行を持てる |
| kukai_id | TEXT FK → kukai | |
| guest_code_id | TEXT FK → guest_codes | |
| display_name | TEXT | 「ゲスト1」「ゲスト2」…（句会内連番） |
| can_submit / can_select / can_comment | INTEGER | 参加時点の権限スナップショット |
| created_at / last_seen_at | INTEGER | |

制約：`UNIQUE(kukai_id, display_name)`、`UNIQUE(session_id, kukai_id)`（1セッションは1句会につき1参加者）。`session_id` 削除時は当該行も削除（ON DELETE CASCADE）。

#### submissions（投句）

| カラム | 型 | 説明 |
|--------|----|----|
| id | TEXT PK | |
| kukai_id | TEXT FK → kukai | |
| author_user_id | TEXT NULL FK → users | 会員が作者の場合 |
| author_guest_id | TEXT NULL FK → guest_participants | ゲストが作者の場合 |
| content | TEXT | 俳句本文 |
| sort_key | TEXT | 選句表示のランダム順（投句時に乱数割当、投句締切時に再シャッフル） |
| is_hidden | INTEGER | 主催者による非表示 |
| hidden_by | TEXT NULL FK → users | |
| hidden_reason | TEXT NULL | |
| created_at / updated_at | INTEGER | |

制約：`author_user_id` と `author_guest_id` はどちらか一方のみ非 NULL。

#### selections（選句）

| カラム | 型 | 説明 |
|--------|----|----|
| id | TEXT PK | |
| kukai_id | TEXT FK → kukai | |
| submission_id | TEXT FK → submissions | |
| selector_user_id | TEXT NULL FK → users | |
| selector_guest_id | TEXT NULL FK → guest_participants | |
| kind | TEXT | `special` / `regular` / `reverse` |
| created_at | INTEGER | |

制約：`UNIQUE(submission_id, selector_user_id)` および `UNIQUE(submission_id, selector_guest_id)`（1つの句に対し1選者は1種別のみ）。アプリ層で「自句選句の禁止」「種別ごとの上限数」を検証。

#### comments（コメント）

| カラム | 型 | 説明 |
|--------|----|----|
| id | TEXT PK | |
| kukai_id | TEXT FK → kukai | |
| submission_id | TEXT FK → submissions | |
| author_user_id | TEXT NULL FK → users | |
| author_guest_id | TEXT NULL FK → guest_participants | |
| body | TEXT | |
| created_at / updated_at | INTEGER | |

#### kukai_phase_events（フェーズ遷移ログ）

| カラム | 型 | 説明 |
|--------|----|----|
| id | TEXT PK | |
| kukai_id | TEXT FK → kukai | |
| from_phase / to_phase | TEXT | |
| action | TEXT | `advance` / `rewind` / `extend` |
| actor_id | TEXT FK → users | |
| note | TEXT NULL | |
| created_at | INTEGER | |

#### notifications（アプリ内通知）

| カラム | 型 | 説明 |
|--------|----|----|
| id | TEXT PK | |
| user_id | TEXT FK → users | 宛先 |
| type | TEXT | `join_request_received` / `join_approved` / `join_rejected` / `phase_changed` / `kukai_deleted` / `recovery_requested` / `recovery_code_issued` / `recovery_code_used` など |
| payload | TEXT | JSON（結社 ID、句会 ID・句会名、旧/新フェーズ名など）。通知一覧の文面生成に使う |
| read_at | INTEGER NULL | |
| created_at | INTEGER | |

#### recovery_requests（パスキー復旧依頼 / 「5.5」）

| カラム | 型 | 説明 |
|--------|----|----|
| id | TEXT PK | |
| user_id | TEXT FK → users | 復旧対象（未認証で作成されるが、既存メールに一致した場合のみ行を作る） |
| organization_id | TEXT FK → organizations | 依頼が回送される結社（対象が複数結社に所属なら各結社に 1 行） |
| status | TEXT | `pending` / `handled` / `expired` |
| note | TEXT NULL | 依頼者メッセージ（任意） |
| created_at | INTEGER | |
| handled_by | TEXT NULL FK → users | 対応した管理者 |
| handled_at | INTEGER NULL | |

制約：`UNIQUE(user_id, organization_id)` where `status = 'pending'`。作成時のレート制限は KV。

#### account_recovery_codes（パスキー再登録コード / 「5.5」）

| カラム | 型 | 説明 |
|--------|----|----|
| id | TEXT PK | |
| user_id | TEXT FK → users | 復旧対象 |
| code_hash | TEXT | コードの SHA-256（hex）。生コードは保存しない |
| issued_by | TEXT FK → users | 発行した管理者 |
| issued_via | TEXT | `organization_admin` / `system_admin` |
| organization_id | TEXT NULL FK → organizations | 結社管理者による発行時の結社（監査・権限文脈） |
| issuer_ip | TEXT NULL | 発行時 IP |
| used_at | INTEGER NULL | 使用時刻（NULL＝未使用） |
| used_ip | TEXT NULL | 使用時 IP |
| used_user_agent | TEXT NULL | 使用時 UA |
| expires_at | INTEGER | 発行から 24 時間 |
| created_at | INTEGER | |

制約：1 ユーザーにつき「未使用かつ未失効」の行は最大 1 件（部分ユニーク相当。再発行時にアプリ層で前行を失効させる）。索引 `account_recovery_codes(user_id)`。

#### csv_imports（CSV 一括登録の履歴）

| カラム | 型 | 説明 |
|--------|----|----|
| id | TEXT PK | |
| organization_id | TEXT FK → organizations | |
| uploaded_by | TEXT FK → users | |
| status | TEXT | `pending` / `succeeded` / `failed` / `partial` |
| row_count | INTEGER | |
| error_log | TEXT NULL | JSON（行番号 → エラー） |
| created_at | INTEGER | |

### 7.3 インデックス方針

- 公開 URL 参照：`organizations.id`, `kukai.id`, `users.public_id`, `guest_codes.code` はいずれも PK / UNIQUE で高速参照。
- 一覧系：`kukai(organization_id, phase, deleted_at)`, `submissions(kukai_id)`, `selections(kukai_id)`, `comments(kukai_id, submission_id)`, `organization_memberships(user_id)`, `organization_memberships(organization_id, role)`, `notifications(user_id, read_at)`, `organization_join_requests(organization_id, status)`, `recovery_requests(organization_id, status)`, `account_recovery_codes(user_id)`。
- セッション：`sessions(expires_at)`（期限切れ掃除用）、`sessions(user_id)`。

### 7.4 データ保持

- 句会データの自動削除は行わない。
- 削除は原則「論理削除」（`deleted_at`）。物理削除はシステム管理者の明示操作のみ。
- 個人の俳句一覧（`/u/:publicId/haiku`）は結社退会後・結社閉鎖後も常に閲覧可能（本人の句のみ、句会名・兼題・日付を添える）。

---

## 8. 句会のフェーズと進行

### 8.1 フェーズ（`kukai.phase`）

| 値 | 表示 | 参加者ができること |
|----|------|--------------------|
| `draft` | 準備中 | 主催者のみ。設定編集 |
| `preparing` | 受付開始 | 参加者は句会情報の閲覧。投句は不可 |
| `submission` | 投句期間 | 投句の追加・修正・削除（自句、上限数まで） |
| `submission_closed` | 投句締切 | 投句不可。主催者が内容確認 |
| `selection` | 選句期間 | 選句（特選・並選・逆選）とコメント入力。他者のコメントは見えない |
| `selection_closed` | 選句締切 | 選句不可。集計待ち |
| `result` | 結果発表 | 得点・順位を閲覧。作者は `authors_revealed_at` 設定後に公開 |
| `commenting` | 講評期間 | 追加コメント可。全員のコメントが公開される |
| `comment_closed` | 講評締切 | コメント不可 |
| `closed` | 終了 | 閲覧のみ |

### 8.2 遷移ルール

- 遷移は**主催者（またはシステム管理者）の手動操作のみ**。`POST /api/kukai/:id/phase` に `direction: advance | rewind` を渡す。
- `advance` は上表の次の状態へ、`rewind` は1つ前へ。巻き戻しはデータを破棄しない（例：`selection` → `submission_closed` に戻しても選句データは残す）。
- `scheduled_*_at` は UI に「予定」として表示するだけで、到達しても自動遷移しない。主催者は任意のタイミングで予定時刻を変更（延長）できる（`action: extend`）。
- すべての遷移を `kukai_phase_events` に記録する。
- フェーズ変更時、当該句会の参加者（会員のみ）に `phase_changed` のアプリ内通知を作成する。ペイロードに `kukaiId` / `kukaiName` / `fromPhase` / `phase`（遷移後）を含め、通知一覧では「『{句会名}』のフェーズが『{旧フェーズ}』から『{新フェーズ}』に変わりました」と表示する。

### 8.3 作者公開

- `result` 以降で主催者が「作者を公開」操作を行うと `authors_revealed_at` を設定。それまで投句の作者は API レスポンスに含めない（サーバ側でマスク）。

### 8.4 画面反映（ポーリング）

- 句会関連画面を開いている間、クライアントは `GET /api/kukai/:id/state` を約 15 秒間隔でポーリングする。
- レスポンスは軽量（`phase`, `authors_revealed_at`, `updated_at`, 投句数・選句提出済み人数などのカウンタ、`server_time`）。
- `phase` や主要カウンタが変化したら、その画面のデータを再取得し UI を更新する。タブが非アクティブの間はポーリングを止める。

---

## 9. 機能仕様

### 9.1 ユーザー / プロフィール

- 登録：メールアドレス + 俳号 + パスキー作成（「5.1」）。
- プロフィール編集：俳号の変更、プロフィール画像のアップロード（R2）。
  - 画像は `POST /api/me/avatar`（multipart）。サーバ側で `image/png|jpeg|webp`・最大サイズ（例：2MB）を検証し、`avatars/<userId>/<uuid>` として R2 に put。旧オブジェクトは削除。
  - 配信は `GET /api/avatars/:userId`（Worker 経由で R2 から stream、`Cache-Control` 付与）。
- 退会：本人の申請でアカウントを無効化。投句・コメントは俳号を残したまま保持（個人俳句一覧も閲覧可能なまま）。物理削除はしない。

### 9.2 結社

- 作成：任意のログインユーザーが名称・説明・画像（任意）を指定して作成。作成者が `admin`。画像は結社管理画面でも変更・削除できる（R2、`image/png|jpeg|webp`・2MB）。
- 一覧・詳細：結社の公開情報（名称・説明・メンバー数・開催中の句会）を表示。
- 参加申請：ユーザーが結社詳細から申請（任意メッセージ付き）。`organization_join_requests` に `pending` で作成し、管理者・副管理者へ `join_request_received` 通知。
- 承認 / 却下：管理者・副管理者が申請一覧から操作。
  - 承認：`organization_memberships` を `member` で作成、申請を `approved`、申請者へ `join_approved` 通知。
  - 却下：申請を `rejected`、申請者へ `join_rejected` 通知。
- 退会：メンバーが自主退会。管理者・副管理者は強制退会が可能。最後の管理者は委譲するまで退会不可。
- 副管理者の任免：管理者のみ。
- 結社情報の編集：管理者・副管理者。
- 結社の閉鎖：管理者のみ。`status = 'closed'`、`closed_at` を設定。
  - 閉鎖後、その結社の句会は**閲覧不可**（パブリック句会も含む）。復旧するには結社を再開（`status = 'open'`）する。

### 9.3 句会

- 作成：結社メンバー（管理者・副管理者含む）が、所属結社を選んで作成。作成者が `organizer_id`。
- 設定項目：兼題、一人当たり投句数、選句数（特選・並選・逆選）、各選の点数、ゲスト参加可否、ゲスト権限（投句・選句・コメント）、公開設定（public / private）、各フェーズの予定時刻。
- 公開範囲：
  - `private`：結社メンバーとゲストのみ閲覧可。
  - `public`：終了後は誰でも閲覧可（進行中の公開範囲は結社メンバー + ゲスト）。
  - いずれも所属結社が `closed` なら閲覧不可。
- 管理：主催者は管理画面から不適切な句を非表示（`is_hidden`）にできる。非表示句は選句対象・集計・一覧から除外。
- 削除：
  - 主催者：自分の句会を論理削除。
  - 結社管理者・副管理者：結社内の句会を論理削除・復活。
  - 論理削除された句会は一覧に出ず、URL 直アクセスも 404 相当（復活で戻る）。

### 9.4 投句

- `submission` フェーズでのみ追加・修正・削除が可能。
- 匿名。作者は `authors_revealed_at` 設定まで他者に見えない。
- 1人あたり `submissions_per_user` 句まで。
- 投句締切（`submission` → `submission_closed`）時に全投句の `sort_key` を再シャッフルする。

### 9.5 選句

- `selection` フェーズでのみ可能。
- 句は `sort_key` 昇順（＝ランダム順）で表示。非表示句・自句は一覧から除外。
- 1つの句に対し「特選・並選・逆選のいずれか1つ」を選択。選び直し・取り消し可。
- 種別ごとに上限（`special_count` / `regular_count` / `reverse_count`）。上限超過はエラー。
- 自句の選句は API 側で拒否。

### 9.6 コメント

- `selection` フェーズ中は「自分が入力したコメントのみ」閲覧可能。
- `result` 到達後、全員のコメントを投稿者の俳号付きで公開。
- `commenting` フェーズで追加コメント可。

### 9.7 結果発表

- `result` フェーズで得点集計：
  - 各投句のスコア ＝ Σ（`special` 数 × `special_points` ＋ `regular` 数 × `regular_points` ＋ `reverse` 数 × `reverse_points`）。
  - 順位はスコア降順。同点は投句時刻の昇順で安定ソート（表示上は同順位表記）。
- 集計結果に、選者一覧（誰がどの種別で採ったか）を添える。
- 作者名は `authors_revealed_at` 設定後に表示。

### 9.8 ゲスト参加

- 主催者がゲストコードを発行（`allow_guest = true` の句会のみ）。有効期限は発行から3ヶ月固定。使用上限は任意。
- 参加：`POST /api/guest/join` に `code` と希望表示名（任意）を渡す。
  - コードが有効・未失効・期限内・上限内なら、当該句会の `guest_participant` を作成（表示名は「ゲスト N」の連番。希望名があれば `ゲストN（希望名）` 等の形式は将来検討）。
  - 権限は句会設定のスナップショット（`can_submit` 等）。
  - リクエストにゲストセッションが無ければ新規発行し、あれば既存セッションに `guest_participant` を追加する（`guest_participants.session_id` で紐づく）。
- **ゲストはコードを持てば複数の句会に並行して参加できる。**同時参加数の上限は設けない。
  - 同じ句会の同じセッションから再度 `join` した場合は既存の `guest_participant` を返す（重複作成しない。`UNIQUE(session_id, kukai_id)`）。
  - 会員（ログイン済みユーザー）は当然に複数句会へ参加可能。
- 各句会へのアクセス可否は、その句会で使ったゲストコードの有効期限・失効状態で個別に判定する。あるコードが期限切れ・失効しても、他の句会への参加は影響を受けない。
- 終了した句会も、参加に使ったゲストコードが有効な限り閲覧可能。

### 9.9 エクスポート / インポート

- 句会エクスポート（主催者・結社管理者・副管理者、句会が `result` 以降）：
  - **テキスト**：兼題、投句された俳句、コメント（投稿者の俳号付き）。縦組み風の整形はしない（プレーンテキスト）。
  - **CSV**：兼題、日時、投句（作者の俳号）、選句内訳、得点、コメント（投稿者の俳号）。UTF-8 + BOM、ヘッダ行付き。
- 個人俳句エクスポート（本人、`/u/:publicId/haiku` から）：
  - **テキスト**：日付・句会名・兼題・句・得点。
  - **PDF はスコープ外**（「14. スコープ外」）。画面は縦書き表示で提供。
- CSV インポート（結社管理者・副管理者）：
  - 過去の句会データを一括登録。1 ファイル ＝ 複数句会 or 1句会（フォーマットは実装時に確定）。
  - サーバは行単位で検証し、`csv_imports` に結果を記録。取り込んだ句会は `source_import_id` を持ち、フェーズは `closed` で作成。
  - 大きなファイルは Workers の CPU / サブリクエスト上限に配慮し、分割アップロード or 事前バリデーション + バッチ投入とする（詳細は実装時）。

### 9.10 アプリ内通知

- 対象イベント：結社参加申請の受信、参加承認 / 却下、句会のフェーズ変更、句会の論理削除、（システム管理者による）コンテンツ削除・アカウント停止、パスキー復旧依頼の受信 / 復旧コードの発行・使用（「5.5」）。
- `GET /api/notifications`（ページング）、`POST /api/notifications/:id/read`、`POST /api/notifications/read-all`。
- ヘッダの通知ベルに未読数。ポーリングまたは画面遷移時に取得。
- **メール送信は行わない。**

### 9.11 アカウント復旧（案D）

- フロー・権限・監査は「5.5」。会員向け（`/recover`）と結社管理画面（依頼一覧・コード発行）に分かれる。
- 発行・使用のたびに、その結社の他の管理者・副管理者へアプリ内通知（サイレント化させない）。

### 9.12 システム管理

- 全結社・全句会の閲覧・管理（論理削除・復活、閉鎖の強制解除など）。
- 不適切コンテンツ（投句・コメント）の削除。
- ユーザーアカウントの停止（`status = 'suspended'`）・削除。
- 全ユーザーのパスキー復旧コード発行、および全 `account_recovery_codes` イベントの閲覧（乱用検知）。
- 監査のため主要操作は `kukai_phase_events` 等のログに `actor_id` を残す。管理操作専用ログは将来検討。

---

## 10. ルーティングとデータ規約

データの入出力は、原則として**画面ルートの loader / action** で行う。fetch 駆動が避けられない口だけを **`/api/*` のリソースルート**にする。

### 10.1 規約

- **読み取り（loader）**：画面が必要とするデータを1つの loader でまとめて返す。所属・権限は `getAuth()` → `authorize()` で判定し、不足は `redirect('/login')` または `throw new Response(null, { status: 403 })`。
- **書き込み（action）**：`<Form>` / `useFetcher` から呼ぶ。入力は `app/lib` の Zod スキーマで `safeParse`。失敗は `{ fieldErrors }` を 422 相当で返し、フォームが表示。成功後は RR が同ページの loader を自動再検証する（明示的なキャッシュ無効化は不要）。
- **業務エラー**：フェーズ不整合・上限超過などは `data({ error }, { status: 409 })` で返し、UI がメッセージ表示。
- **一覧**：件数が小さい（「12.2」）ため基本は一括取得。投句一覧・通知など増え得るものだけ `?cursor=` のカーソルページング。
- **CSRF**：状態変更は POST のみ。`Origin` / `Sec-Fetch-Site` を検証し、`__Host-` + `SameSite=Lax` Cookie と併用。
- **リソースルート**：`loader` のみ（または `action` のみ）を持ち `Response` を返す。WebAuthn・ポーリング・ダウンロード・画像配信に限定。

### 10.2 画面ルートと loader / action（抜粋）

| ルート | loader が返すもの | action（書き込み） | 権限 |
|--------|-------------------|--------------------|------|
| `_index`（`/`） | 進行中の句会、過去の句会（先頭5件）、所属結社、未読通知数 | — | 会員 |
| `kukai._index`（`/kukai`） | 進行中の句会・過去の句会（会員として所属する結社のもの） | — | 会員 |
| `login` / `register` | — | （WebAuthn はリソースルート） | 未認証 |
| `recover`（`/recover`） | 説明文（依頼フォーム／コード入力フォームの2モード） | 復旧依頼の作成（`recovery_requests`） | 未認証。WebAuthn 再登録はリソースルート |
| `settings` | プロフィール、登録済み認証子一覧 | 俳号更新 / 画像更新・削除 / 認証子削除 / 退会 / 全端末ログアウト | 本人 |
| `orgs`（`/orgs`） | 結社一覧 | 結社作成 | 一覧:公開 / 作成:会員 |
| `orgs.$orgId` | 結社詳細、メンバー数、開催中の句会、自分の申請状態 | 参加申請 / 申請取り下げ / 自主退会 | 詳細:公開 |
| `orgs.$orgId.admin` | 参加申請一覧、メンバー一覧、句会一覧、インポート履歴、パスキー復旧依頼一覧 | 結社情報編集 / 申請の承認・却下 / 強制退会 / 副管理者の任免 / 閉鎖・再開 / CSV インポート / **パスキー復旧コード発行** | 管理者・副管理者（閉鎖は管理者） |
| `orgs.$orgId.kukai.new` | 作成フォームの初期値 | 句会作成 | メンバー |
| `kukai.$kukaiId` | 句会情報、現在フェーズ、参加状態、自分の投句、（フェーズに応じ）結果 | フェーズ遷移（advance / rewind / extend）/ 作者公開 / 論理削除・復活 / 設定変更 / 句の非表示切替 / ゲストコード発行・失効 | 閲覧:閲覧可能者 / 変更:主催者 |
| `kukai.$kukaiId.submit` | 自分の投句、投句上限、締切 | 投句の追加・修正・削除（`submission` フェーズ、上限、自句のみ） | 参加者 |
| `kukai.$kukaiId.select` | 選句シート（ランダム順、自句・非表示除外）、自分の選句とコメント | 選句の設定・解除、コメントの投稿・編集 | 参加者（`selection` フェーズ、種別上限、自句禁止） |
| `kukai.$kukaiId.results` | 集計結果、順位、選者内訳、（公開後）作者、全コメント | 追加コメント（`commenting` フェーズ） | 閲覧可能者（`result` 以降） |
| `guest`（`/guest?code=`） | コードの有効性・対象句会の概要 | ゲスト参加 | 未認証（コード必須） |
| `u.$publicId` | 本人の投句一覧（句会名・兼題・日付・得点） | — | 公開 |
| `admin.*` | 全結社・全句会・全ユーザー | コンテンツ削除 / アカウント停止・削除 / 閉鎖の強制解除 / 句会の論理削除・復活 | システム管理者 |

### 10.3 リソースルート（`/api/*`）

| メソッド・パス | 用途 | 権限 |
|----------------|------|------|
| `POST /api/auth/register/options` `.../verify` | パスキー登録セレモニー | 未認証 |
| `POST /api/auth/login/options` `.../verify` | パスキーログインセレモニー | 未認証 |
| `POST /api/auth/credentials/options` `.../verify` | 認証子の追加セレモニー | 本人 |
| `POST /api/auth/recovery/redeem/options` `.../verify` | 復旧コードの検証 + パスキー再登録セレモニー（「5.5」） | 未認証（メール + コード必須） |
| `GET  /api/kukai/:kukaiId/state` | 軽量ポーリング用の状態（`phase` / `authors_revealed_at` / 各種カウンタ / `server_time`） | 閲覧可能者 |
| `GET  /api/avatars/:userId` | R2 からプロフィール画像を stream（`Cache-Control` 付与） | 公開 |
| `GET  /api/orgs/:orgId/image` | R2 から結社画像を stream | 公開 |
| `GET  /api/kukai/:kukaiId/export?format=text\|csv` | 句会エクスポートのダウンロード | 主催者・結社管理者・副管理者 |
| `GET  /api/u/:publicId/haiku.txt` | 個人俳句エクスポート（テキスト）のダウンロード | 本人 |

> ログアウトは `settings` の action で処理するため専用エンドポイントは持たない。画像アップロードも `settings` の action（multipart）で受ける。

### 10.4 型共有

- 入力・レスポンス整形の Zod スキーマを `app/lib/schemas/*` に定義。action の `safeParse` とフォーム側のクライアント検証で同一スキーマを使う。
- enum（フェーズ、ロール、通知種別、選句種別）は `app/lib/constants.ts` に集約。
- loader / action の戻り値型は `useLoaderData<typeof loader>()` / `useActionData<typeof action>()` で自動推論。`react-router typegen` で `.react-router/types` を生成する。

---

## 11. フロントエンド設計

### 11.1 ルーティング（React Router v8 framework mode、抜粋）

`app/routes.ts` で定義。URL と画面の対応は次の通り（loader / action の内容は「10.2」）。

| URL | ルートモジュール | 画面 | 認証 |
|-----|------------------|------|------|
| `/` | `routes/_index.tsx` | ダッシュボード（進行中の句会・過去の句会・所属結社・未読通知） | 要 |
| `/kukai` | `routes/kukai._index.tsx` | 句会一覧（進行中・過去）。ヘッダから常時アクセス | 要 |
| `/login` `/register` | `routes/login.tsx` `routes/register.tsx` | パスキー認証 | 不要 |
| `/recover` | `routes/recover.tsx` | パスキー復旧（依頼 / コード入力）「5.5」 | 不要 |
| `/notifications` | `routes/notifications.tsx` | アプリ内通知一覧・既読 | 要 |
| `/settings` | `routes/settings.tsx` | プロフィール・パスキー管理 | 要 |
| `/orgs` `/orgs/new` `/orgs/:orgId` | `routes/orgs._index.tsx` ほか | 結社一覧・作成・詳細 | 詳細は一部公開 |
| `/orgs/:orgId/admin` | `routes/orgs.$orgId.admin.tsx` | 結社管理（申請・メンバー・句会・インポート・**パスキー復旧**） | 管理者・副管理者 |
| `/orgs/:orgId/kukai/new` | `routes/orgs.$orgId.kukai.new.tsx` | 句会作成 | メンバー |
| `/kukai/:kukaiId` | `routes/kukai.$kukaiId.tsx` | 句会トップ（フェーズ別 UI、主催者は管理パネルも同画面） | 閲覧可能者 |
| `/kukai/:kukaiId/submit` | `routes/kukai.$kukaiId.submit.tsx` | 投句 | 参加者 |
| `/kukai/:kukaiId/select` | `routes/kukai.$kukaiId.select.tsx` | 選句（縦書きシート） | 参加者 |
| `/kukai/:kukaiId/results` | `routes/kukai.$kukaiId.results.tsx` | 結果・講評 | 閲覧可能者 |
| `/guest` | `routes/guest.tsx` | ゲスト参加（`?code=`） | 不要 |
| `/u/:publicId` | `routes/u.$publicId.tsx` | 個人俳句一覧（公開・SSR） | 不要 |
| `/admin/*` | `routes/admin.tsx` ほか | システム管理 | システム管理者 |

- 句会管理は専用 URL を分けず、`/kukai/:kukaiId` の中で主催者にだけ管理 UI を出す（loader が権限に応じて返すデータを変える）。

### 11.2 データ取得・状態

- **サーバ状態は RR の loader が担う**。専用のデータ取得ライブラリ（TanStack Query 等）は使わない。ミューテーション（action）成功後は RR が loader を自動再検証する。
- **認証状態**は `root.tsx` の loader が返す（俳号・アバター・未読通知数・システム管理者フラグ）。子ルートは `useRouteLoaderData('root')` で参照。未認証で保護ルートに入ったら loader が `/login` へ `redirect`。
- **ポーリング**：`useKukaiStatePolling(kukaiId)` フックが `useFetcher` で `GET /api/kukai/:kukaiId/state` を約 15 秒間隔で取得。`phase` や主要カウンタが前回値から変化したら `useRevalidator().revalidate()` でそのページの loader を再実行する。`document.visibilityState === 'hidden'` の間はポーリングを止める。
- **楽観的更新**：選句のトグルなど即応性が要る操作は `useFetcher` の `fetcher.formData` を使って送信中の状態を先行描画する。

### 11.3 クライアント状態の最小化

- グローバルなクライアント状態管理ライブラリは導入しない。UI ローカル状態は `useState`、URL に載せられるもの（タブ・フィルタ）は検索パラメータに置く。

### 11.4 ビジュアル・アイデンティティ

- コンセプト：句会を「その場」に。句は**短冊**（縦組みの細長い紙）に載り、右→左の読み順で吊るされ、良い句に**朱の落款**を押す。
- トークン（`app/app.css` の `@theme`）：`--color-sumi`（墨）/`--color-sumi-soft`/`--color-washi`（和紙・ページ）/`--color-washi-edge`/`--color-rule`（界線）/`--color-ai`（表装の藍・アクセント）/`--color-shu`（落款の朱）。
- 書体：見出し＝明朝（`--font-mincho`、システムフォント）、本文・UI＝角ゴシック（`--font-gothic`）、数値＝ゴシック + `tabular-nums`（`.u-data`）。
- 共有 UI（`app/components/`）：`Logo` / `LogoMark` / `Seal`（円相＝落款＝アプリマークを同形）、`ui.tsx`（`Panel`（影なし・界線一本）/`SectionLabel`（朱角＋和文）/`PageTitle`/`Note`/`ActionNote`）、`Tanzaku` / `TanzakuRow`（縦組みの句を右→左に吊るす）、`PhaseTrack`（句会フェーズの進行）。
- favicon は `public/favicon.svg`。動きは特選押印のワンショットのみ（`prefers-reduced-motion` 尊重）。

### 11.5 縦書き表示

- Tailwind に縦書きユーティリティを追加：
  - `.tategaki { writing-mode: vertical-rl; text-orientation: upright; line-break: strict; }`
  - 数字・英字の向き、拗促音の扱い、ルビ有無は実装時に詰める。
- 句カード／選句シート／個人俳句一覧は縦書き。管理系 UI は横書き。
- モバイルファースト。縦書きブロックは横スクロール可能なコンテナに入れる。

### 11.6 その他 UI 要件

- レスポンシブ（モバイル対応必須）。
- モダンブラウザ全般に対応。オフライン非対応。スマホネイティブアプリは作らない。

---

## 12. 非機能要件

### 12.1 Cloudflare 由来の制約と方針

| 項目 | 制約 | 方針 |
|------|------|------|
| Workers CPU 時間 | リクエストあたり上限あり | SSR レンダリングは軽量に保つ。集計・エクスポート・CSV インポートは重い処理を分割。loader での N+1 を避け D1 クエリをまとめる |
| D1 | SQLite。書き込みは直列。1クエリの結果サイズ・バインド数に上限 | 想定規模では上限に当たらない（「12.2」）。バルク投入のみバッチ（`batch()`）分割 |
| サブリクエスト数 | 1リクエストで上限あり | R2 への多数アクセスを避け、画像は1リクエスト1オブジェクト |
| Cron / バックグラウンド | 本仕様では不使用 | 期限切れセッション掃除はアクセス時の遅延削除、または管理スクリプト |
| リアルタイム | DO/WS 不使用 | ポーリング（「8.4」「11.2」） |

### 12.2 規模の想定

- **結社数：最大 100 未満。1 結社あたりのメンバー数：最大 100 人（多くは 20〜30 人）。**
- 総ユーザー数はおおむね数千人、最大でも 1 万人規模。DB サイズは数年運用しても数十 MB。1 句会あたりの行数は投句・選句・コメントいずれも数百以内。
- 書き込みの集中は「選句フェーズで 20〜30 人が数分の間に選句する」程度で、ピークでも毎秒 1 未満。**D1（SQLite 単一ライター）で詰まらない。**
- したがって性能・スケールはスタック選定の決め手にせず、運用の単純さ・コスト・記述量で選ぶ（「2. 技術スタック」）。実運用コストは Cloudflare 無料枠〜有料 $5/月の見込み。
- 一覧はほぼ一括取得でよい。投句一覧・通知など将来的に増え得るものだけカーソルページングを用意する。

### 12.3 セキュリティ

- 認証はパスキーのみ。パスワードは持たない。復旧は「5.5」の管理者仲介（案D）。
- 公開 URL は連番を使わず UUID / 推測困難トークン（`kukai.id`, `organizations.id`, `users.public_id`, `guest_codes.code`）。
- セッション Cookie は `__Host-` プレフィックス + `Secure` + `HttpOnly` + `SameSite=Lax`。
- 状態変更 API は `Origin` / `Sec-Fetch-Site` 検証で CSRF 対策。
- 認証・ゲスト参加・登録オプション取得・復旧依頼・復旧コード検証はレート制限（KV カウンタ、IP + 対象キー単位）。
- パスキー復旧（「5.5」）：生コードは保存せずハッシュのみ。24 時間・単回・1 ユーザー束縛。できるのはパスキー追加のみ。発行・使用イベントは `issued_by` / `used_ip` / `used_user_agent` を記録し、同結社の他管理者へ通知（サイレント化させない）。「メール実在の有無」は依頼レスポンスで漏らさない。
- 匿名性：`authors_revealed_at` 未設定の間、投句作者はサーバ側で確実にマスク（レスポンス整形時に落とす）。
- 権限判定は `authz` サービスに集約し、ルートごとに明示。
- R2 アップロードは MIME・拡張子・サイズ・（可能なら）マジックバイト検証。

### 12.4 対応環境

- モダンブラウザ全般。WebAuthn（プラットフォーム認証子）が使えることが前提。
- オフライン非対応。

---

## 13. Rails版からの変更点

| 項目 | 旧（Rails 8） | 新（Cloudflare） |
|------|---------------|-------------------|
| 実行基盤 | Rails サーバ | Cloudflare Workers（単一 Worker）。staging / production の 2 環境 |
| 言語 | Ruby | TypeScript |
| ローカル環境 | rails server | Docker（`docker compose` 上の `react-router dev` + ローカルエミュレーション） |
| デプロイ | 手動 / 任意 | GitHub Actions（`dev` push → dev、`main` push → production） |
| アプリ構成 | Rails MVC + Turbo/Stimulus | React Router v8（framework mode）。loader / action + SSR、fetch 駆動の口のみ `/api/*` リソースルート |
| DB | SQLite（自前） | Cloudflare D1 |
| ORM | Active Record | Drizzle ORM |
| 認証実装 | Rails + パスキー gem | `@simplewebauthn/*` + D1 セッション |
| アカウント復旧 | （パスワード再設定を想定） | パスキーのみ。復旧は**結社管理者 / システム管理者が一回限りの再登録コードを発行**（案D、「5.5」）。メール不使用 |
| 画像保存 | Active Storage 等 | Cloudflare R2 |
| メール通知 | ActionMailer | **廃止**（Web 申請 → オーナー承認、アプリ内通知のみ） |
| フェーズ自動遷移 | ジョブ / cron 想定 | **廃止**（主催者の手動操作のみ、時刻は目安表示） |
| リアルタイム更新 | WebSocket（任意） | **廃止**（軽いポーリング） |
| ゲストの複数句会参加 | 「同時参加は不可」 | **許可**（コードがあれば複数句会に並行参加可。1ゲストセッションに句会ごとの `guest_participant` を紐づけ） |
| 個人俳句 PDF（縦書き） | Rails で PDF 生成 | **スコープ外**（画面は縦書き表示、出力はテキストのみ） |
| テスト | `rails test` / `rails test:system` | Vitest（vitest-pool-workers）/ Playwright |
| Lint | RuboCop | Biome |

機能要件（結社・句会・投句・選句・コメント・ゲスト・エクスポート・システム管理・論理削除・匿名性・縦書き表示）は原則そのまま維持する。

---

## 14. スコープ外・将来課題

### 当面スコープ外（本バージョンで実装しない）

- 個人俳句の **PDF エクスポート（縦書き）**。実装する場合の候補：クライアントサイド生成（pdf-lib + 埋め込み日本語フォント）、Cloudflare Browser Rendering API（Workers 有料プラン）。
- フェーズの時刻ベース自動遷移。
- リアルタイム更新（WebSocket / SSE）。
- メール通知全般。

### 将来検討

- 句会テンプレート機能／定例句会の自動作成。
- 過去句会の検索・フィルタ。
- 結社内ランキング、プロフィール公開範囲設定。
- 通知の ON/OFF 設定。
- ゲストの希望表示名の扱い。
- 管理操作専用の監査ログ。
- サポート体制、退会時のデータ扱いのポリシー明文化。

---

## 15. 開発ロードマップ

MVP は **フェーズ3 完了時点**（登録・ログイン、結社の作成・参加、句会の1サイクル、基本権限）。

### フェーズ1：基盤 ✅ 実装済み

- ✅ React Router v8（framework mode）+ `@cloudflare/vite-plugin` の雛形、`workers/app.ts` で `RouterContextProvider` にバインディング（`env` / `ctx`）を注入
- ✅ Wrangler / Vite / D1 / R2 / KV、`wrangler.jsonc` の `env.staging` / `env.production`、`react-router typegen` / `wrangler types`
- ✅ **Docker 開発環境**（`Dockerfile.dev` / `docker-compose.yml`、`.wrangler` ボリューム、`.dev.vars`）
- ✅ **CI/CD**（`.github/workflows/deploy.yml`：`dev` push → dev、`main` push → production／`ci.yml`：PR で typecheck・lint・test）
- ✅ Drizzle スキーマ（users / webauthn_credentials / sessions / notifications）+ 初期マイグレーション `0000_init.sql` + seed（現状 no-op）
- ✅ パスキー登録・ログイン・セッション（`__Host-` Cookie + D1）・認証子管理（`/api/auth/*` リソースルート + `auth.server.ts` / `webauthn.server.ts`）
- ✅ ユーザーモデル（俳号、プロフィール画像 = R2、`admin:grant` スクリプトでシステム管理者付与）
- ✅ `root.tsx` レイアウト（認証状態 loader、通知ベル（件数のみ）、エラーバウンダリ）、ログイン / 登録 / 設定 / ダッシュボード、レスポンシブ土台、縦書きユーティリティ
- ✅ テスト：Vitest（純粋関数）+ Playwright（CDP 仮想認証子でパスキー登録→ログインの E2E）
- ✅ Cloudflare 実リソース（`nqkai-staging` / `nqkai-prod` の D1・R2・KV）、両環境デプロイ・リモート D1 マイグレーション・GitHub Secrets 済み。CI/CD で `dev`→staging / `main`→production を実地確認
- ✅ `main` ブランチ保護ルールセット Active
- ⏳ フォローアップ：複数パスキー登録の推奨バナー（案E、「5.1」）

### フェーズ2：結社 ✅ 実装済み

- ✅ 結社の作成・編集・一覧・詳細（`/orgs`、`/orgs/new`、`/orgs/:orgId`、`/orgs/:orgId/admin`）
- ✅ 参加申請 → 承認 / 却下 / 取り下げ（アプリ内通知）。部分ユニークで多重申請を防止
- ✅ メンバー一覧、自主退会・強制退会（最後の管理者は保護）
- ✅ 管理者・副管理者の権限（`authz.server.ts` の `canManageOrg` / `isOrgAdmin`）、結社の閉鎖・再開
- ✅ **アカウント復旧（案D、「5.5」）**：`recovery_requests` / `account_recovery_codes` テーブル、`/recover`（依頼 / コード再登録の2モード）、結社管理画面の依頼一覧・メンバー行からのコード発行（一度だけ表示）、`/api/auth/recovery/redeem/{options,verify}` リソースルート、発行・使用時の監査（IP/UA）と同結社の他管理者への通知、再登録で全セッション失効
- ✅ アプリ内通知一覧 `/notifications`（既読 / 全既読）、ヘッダの未読バッジ
- ✅ 結社の画像（作成/管理画面でアップロード、R2、`/api/orgs/:orgId/image` で配信）— issue #6
- ✅ KV レートリミッタ（`ratelimit.server.ts`、復旧依頼に適用）
- ✅ ダッシュボードに所属結社・未読通知
- ✅ テスト：Vitest（復旧コード生成・正規化）+ Playwright（結社作成→申請→承認→役割反映→復旧コード発行→別端末で再登録）
- マイグレーション `0001_orgs_and_recovery.sql`

### フェーズ3：句会の基本サイクル（MVP）✅ 実装済み

- ✅ 句会の作成（全設定項目）`/orgs/:orgId/kukai/new`、詳細・主催者メニュー `/kukai/:kukaiId`
- ✅ フェーズ状態機械（`KUKAI_PHASES` の10段階）+ 主催者の手動遷移（advance/rewind）+ `kukai_phase_events` + `extend` + ポーリング（`useKukaiStatePolling` → `/api/kukai/:kukaiId/state`）
- ✅ 投句 `/kukai/:kukaiId/submit`（追加・修正・削除、上限、`submission` フェーズのみ）。投句締切遷移で `sort_key` を再シャッフル（`hex(randomblob(16))`）
- ✅ 選句 `/kukai/:kukaiId/select`（`sort_key` 順、自句・非表示除外、特選/並選/逆選の上限、選び直し・取消、自句禁止）
- ✅ 選句中コメント（自分のみ可視）／`commenting` フェーズで追加コメント、`result` 以降は全員のコメント公開
- ✅ 集計・順位（同点同順位）・選者内訳・作者公開制御（`authors_revealed_at`、公開まではサーバ側でマスク）`/kukai/:kukaiId/results`
- ✅ 句の非表示（主催者）、句会の論理削除・復活（主催者 + 結社管理者・副管理者）
- ✅ テスト：Vitest（フェーズ順序ヘルパ）+ Playwright（作成→フェーズ遷移→投句→締切→選句→結果→作者公開の1サイクル）
- マイグレーション `0003_kukai_cycle.sql`
- ✅ フェーズ変更通知の文面を「『{句会名}』のフェーズが『{旧}』から『{新}』に変わりました」に（`phase_changed` ペイロードに `kukaiName` / `fromPhase` 追加、`app/lib/notifications.ts`）— issue #11
- ✅ 句会一覧 `/kukai`（進行中・過去）とヘッダ導線、ダッシュボードのメニュー順を「進行中の句会／過去の句会／所属する結社」に（`listPastKukaiForUser`、`KukaiList` 共用コンポーネント）— issue #13 / #14

### フェーズ4：ゲスト・表示・エクスポート

- ✅ 個人の公開句集 `/u/:publicId`（公開・SSR、縦書き。作者公開済み・非削除の句会の本人の句のみ、句会名・兼題・日付・得点付き）。`listPublicHaiku`
- ✅ 個人俳句エクスポート `GET /api/u/:publicId/haiku.txt`（テキスト、本人のみ）
- ✅ 句会エクスポート `GET /api/kukai/:kukaiId/export?format=text|csv`（主催者・結社管理者・副管理者、`result` 以降。CSV は UTF-8 + BOM）。結果画面に導線。整形は `app/lib/export.ts`（純関数、単体テスト付き）
- ✅ ゲストコード発行・失効（主催者、`allow_guest` の句会のみ、`/kukai/:kukaiId` の主催者メニュー）。マイグレーション `0004_guests.sql`（`guest_codes` / `guest_participants`）
- ✅ ゲスト参加 `/guest?code=`（コード確認 → 参加。ゲストセッションは会員とは別 Cookie、`guest_participants.session_id` で句会ごとに紐づく。複数句会へ並行参加可）
- ✅ ゲスト権限制御（`guest_can_submit` / `_select` / `_comment` のスナップショットで投句・選句・コメントを解禁）、連番表示名「ゲストN」
- 縦書きの句カード・選句シート（フェーズ3 のデザインパスで対応済み）、句会詳細の縦書き調整

### フェーズ5：管理

- 不適切句の非表示、結社管理者による句会の論理削除・復活
- システム管理画面（全体管理、コンテンツ削除、アカウント停止・削除）

### フェーズ6：データ管理

- CSV インポート（検証・履歴・バッチ投入）
- パブリック句会の公開画面（終了後の一般公開、閉鎖結社の非表示）

### フェーズ7：仕上げ

- パフォーマンス最適化（D1 クエリ、ページング）
- セキュリティ確認（CSRF、レート制限、匿名性のマスク漏れ）
- エラーハンドリング整備、E2E テスト拡充

### 開発上の原則

- UUID / 推測困難トークンは最初から使う。
- 論理削除の仕組みを早期に入れる。
- データモデルは初期段階で固める。
- 各フェーズでテストを書く。
- モデル（`app/server/db/schema.ts`）を変更したら本仕様書の「7. データモデル」を更新する。
- ルート（`app/routes.ts`）や loader / action の入出力を変更したら「10. ルーティングとデータ規約」を更新する。

---

## 16. 開発環境・コマンド

### 16.1 ローカル（Docker）

前提：Docker / Docker Compose のみ（Node・pnpm・Wrangler はコンテナ内）。

```bash
# 初回：ローカル用の環境変数を用意
cp .dev.vars.example .dev.vars

# 初回・依存更新時
docker compose build

# 開発サーバ起動（http://localhost:5173）
docker compose up

# 以降のコマンドは実行中コンテナ内で
docker compose exec app pnpm typegen                              # ルート型 + Env 型
docker compose exec app pnpm db:generate                          # schema.ts → migrations/
docker compose exec app pnpm db:migrate:local                     # ローカル D1 に適用（--env staging --local）
docker compose exec app pnpm seed:local                           # フェーズ1は no-op
docker compose exec app pnpm admin:grant <email>                  # 登録後にシステム管理者権限を付与
docker compose exec app pnpm typecheck
docker compose exec app pnpm lint
docker compose exec app pnpm test                                 # Vitest（純粋関数の単体テスト）
docker compose exec app pnpm test:e2e                             # Playwright（仮想認証子でパスキー E2E）
```

- ローカルは常に Miniflare のローカルエミュレーション。`--remote` は使わない。
- `.wrangler/`（ローカル D1/R2/KV の状態）と `node_modules` は名前付きボリュームに載せ、ホストのファイル変更はバインドマウントでホットリロードする。
- `.dev.vars`（Git 管理外。雛形は `.dev.vars.example`）にローカル用の `WEBAUTHN_*` を置く。
- Docker を使わずホストで直接ツールを動かす場合は Node 22.22 以上が必要（React Router v8 の要件）。また `workerd` が動く新しめの glibc も要る。

雛形（実際のファイルはリポジトリ直下）：

```yaml
# docker-compose.yml
services:
  app:
    build: { context: ., dockerfile: Dockerfile.dev }
    command: pnpm dev --host 0.0.0.0
    ports: ["5173:5173"]
    volumes:
      - .:/app
      - node_modules:/app/node_modules
      - wrangler_state:/app/.wrangler
    env_file: [.dev.vars]
    environment: [CLOUDFLARE_ENV=staging]   # staging の binding 定義を使う（状態はローカル）
volumes:
  node_modules:
  wrangler_state:
```

```dockerfile
# Dockerfile.dev
FROM node:22-bookworm-slim
RUN corepack enable
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
EXPOSE 5173
CMD ["pnpm", "dev", "--host", "0.0.0.0"]
```

### 16.2 CI（GitHub Actions）

`.github/workflows/deploy.yml`（`on: push: branches: [dev, main]`）。詳細は「3.3」。

```yaml
jobs:
  deploy:
    runs-on: ubuntu-latest
    env:
      CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
      CLOUDFLARE_ACCOUNT_ID: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
      CLOUDFLARE_ENV: ${{ github.ref_name == 'main' && 'production' || 'staging' }}
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - run: pnpm typecheck
      - run: pnpm lint
      - run: pnpm test
      - run: pnpm build   # CLOUDFLARE_ENV で対象 env を焼き込み
      - run: pnpm exec wrangler d1 migrations apply DB --env "$CLOUDFLARE_ENV" --remote
      - run: pnpm exec wrangler deploy   # 焼き込み済みのため --env なし
```

### 16.3 `wrangler.jsonc`（env 構成）

実ファイルはリポジトリ直下の `wrangler.jsonc`。構成は次のとおり（`$schema` / 詳細は実ファイル参照）。

```jsonc
{
  "name": "nqkai",
  "main": "./workers/app.ts",
  "compatibility_date": "2026-08-01",
  "compatibility_flags": ["nodejs_compat"],
  "assets": { "directory": "./build/client" },
  "observability": { "enabled": true },
  "env": {
    "staging": {
      "name": "nqkai-staging",           // → https://nqkai-staging.mckoy.workers.dev
      "vars": { "WEBAUTHN_RP_ID": "nqkai-staging.mckoy.workers.dev", "WEBAUTHN_RP_NAME": "nQkai（staging）", "WEBAUTHN_ORIGIN": "https://nqkai-staging.mckoy.workers.dev" },
      "d1_databases":  [{ "binding": "DB", "database_name": "nqkai-staging", "database_id": "1f1d1edc-…", "migrations_dir": "migrations" }],
      "r2_buckets":    [{ "binding": "BUCKET", "bucket_name": "nqkai-staging" }],
      "kv_namespaces": [{ "binding": "KV", "id": "3a75afdf…" }]
    },
    "production": {
      "name": "nqkai-prod",              // → https://nqkai-prod.mckoy.workers.dev
      "vars": { "WEBAUTHN_RP_ID": "nqkai-prod.mckoy.workers.dev", "WEBAUTHN_RP_NAME": "nQkai", "WEBAUTHN_ORIGIN": "https://nqkai-prod.mckoy.workers.dev" },
      "d1_databases":  [{ "binding": "DB", "database_name": "nqkai-prod", "database_id": "6084cfde-…", "migrations_dir": "migrations" }],
      "r2_buckets":    [{ "binding": "BUCKET", "bucket_name": "nqkai-prod" }],
      "kv_namespaces": [{ "binding": "KV", "id": "a9c1955e…" }]
    }
  }
}
```

| バインディング | 種別 | 用途 |
|----------------|------|------|
| `DB` | D1 | 主データベース |
| `BUCKET` | R2 | プロフィール画像 |
| `KV` | KV | WebAuthn チャレンジ、レート制限 |

- アカウントの workers.dev サブドメインは 1 つ（`mckoy`、他アプリと共有）。環境は Worker 名（`nqkai-staging` / `nqkai-prod`）で分ける。
- 名前付き env はトップレベルのバインディングを継承しないため、`staging` / `production` の両方に同じ 3 バインディングを再宣言する。
- 静的アセットは React Router の Cloudflare プリセットが `assets`（`build/client`）として配信するため、参照用の名前付きバインディングは不要。
- 環境ごとのシークレット登録（初回のみ）：`wrangler secret put <NAME> --env staging` / `--env production`。

---

## 17. テスト戦略

- **権限境界**：システム管理者・結社管理者・副管理者・メンバー・句会主催者・ゲスト・未認証の各ロールで、許可／拒否を網羅的にテスト。
- **フェーズ遷移**：`advance` / `rewind` / `extend` の各遷移、フェーズ外操作の拒否（投句を `submission` 以外で行う等）、締切時のシャッフル。
- **loader / action**：各ルートの loader / action を、モックした `Request` + `context`（テスト用 D1）で直接呼び、返り値・リダイレクト・ステータスを検証する。
- **匿名性**：`authors_revealed_at` 未設定時に作者情報が loader / リソースルートのレスポンスへ漏れないこと。
- **選句ルール**：自句選句の拒否、種別上限の超過、選び直し・取り消し、非表示句の除外、集計スコア（逆選の負値含む）。
- **ゲスト**：コードの期限切れ・失効・上限超過、権限スナップショット、連番表示名、1セッションでの複数句会並行参加、`:kukaiId` による権限スコープ、未参加句会への操作拒否、あるコード失効が他句会に波及しないこと。
- **エクスポート／インポート**：テキスト / CSV の内容と文字コード、CSV インポートの行単位検証と履歴。
- **認証**：パスキー登録・ログイン・認証子追加／削除、セッションの有効期限とスライド延長、ログアウト（単一・全端末）。
- **E2E（Playwright）**：登録 → 結社作成 → 句会作成 → 投句 → 選句 → 結果発表 の一連フロー、ゲスト参加フロー。WebAuthn は仮想認証子（CDP `WebAuthn` ドメイン）で実行。
