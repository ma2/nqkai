# CLAUDE.md

このファイルは、本リポジトリで作業する Claude Code (claude.ai/code) 向けのガイドである。

## プロジェクト概要

オンライン句会（句会）を開催・管理する Web アプリケーション。結社（結社）機能を持ち、パスキー認証によるセキュアなユーザー管理を行う。詳細な要件・設計・データモデル・API・ロードマップは `SPEC.md` に集約している。**実装前に必ず `SPEC.md` を参照すること。**

## 技術スタック

- 実行環境: Cloudflare Workers（単一 Worker）
- 言語: TypeScript
- アプリフレームワーク: React Router v7（framework mode）。SSR + ネストルーティング + loader / action
- ビルド: Vite + `@react-router/dev`（Cloudflare プリセット）
- UI: React
- データベース: Cloudflare D1（SQLite）
- ORM: Drizzle ORM + drizzle-kit
- ストレージ: Cloudflare R2（プロフィール画像）、Cloudflare KV（WebAuthn チャレンジ・レート制限）
- 認証: パスキー（WebAuthn）。`@simplewebauthn/server` + `@simplewebauthn/browser`
- セッション: HttpOnly Cookie + D1 セッションテーブル
- CSS: Tailwind CSS
- 型・バリデーション共有: Zod（`app/lib`）
- Lint/Format: Biome
- テスト: Vitest + `@cloudflare/vitest-pool-workers`、E2E は Playwright
- デプロイ: Wrangler

### データの流れ

- **読み取り**は各ルートの `loader`（Worker 上で実行、Drizzle で D1 を直接引く）。**書き込み**は `action`（`<Form>` / `useFetcher` から）。action 成功後、RR が loader を自動再検証する。
- 独立した JSON API・SPA・データ取得ライブラリ（TanStack Query 等）は**使わない**。
- fetch 駆動が必要な口だけ `/api/*` の**リソースルート**にする：WebAuthn セレモニー、句会状態のポーリング、エクスポートのダウンロード、画像配信。
- サーバ専用コードは `*.server.ts` / `app/server/` に置き、クライアントバンドルから除外する。

### 採用しないもの

- メール送信基盤（結社参加は Web 申請 → オーナー承認。通知はアプリ内通知のみ）
- リアルタイム更新（WebSocket / Durable Objects / SSE）。フェーズ状態は軽いポーリングで反映
- フェーズの時刻ベース自動遷移（Cron Triggers / DO Alarm）。遷移は主催者の手動操作のみ
- サーバサイドの PDF 生成（当面スコープ外。縦書きは画面表示のみ）

## 開発コマンド

```bash
pnpm install

# ローカル開発（react-router dev。Workers ランタイム + ローカル D1/R2/KV）
pnpm dev

# 型の生成（ルート型 + バインディング型）
pnpm typegen        # react-router typegen && wrangler types

# D1 マイグレーション
pnpm drizzle-kit generate
pnpm wrangler d1 migrations apply nqkai --local
pnpm wrangler d1 migrations apply nqkai --remote

# seed（初期データ・システム管理者作成）
pnpm seed:local

# 型チェック / Lint / Format
pnpm typecheck
pnpm lint
pnpm format

# テスト
pnpm test
pnpm test:e2e

# ビルド / デプロイ
pnpm build           # react-router build
pnpm wrangler deploy
```

## プロジェクト構成

```
workers/
└─ app.ts           Worker エントリ（RR ハンドラ + getLoadContext でバインディング注入）
app/
├─ root.tsx         ルートレイアウト（認証状態 loader、通知ベル、エラーバウンダリ）
├─ routes.ts        ルート定義
├─ routes/          ルートモジュール（loader / action / default コンポーネント、api.* はリソースルート）
├─ server/          サーバ専用（*.server.ts のみ）
│  ├─ db/           schema.ts（Drizzle）/ client.server.ts
│  ├─ auth.server.ts / authz.server.ts / ratelimit.server.ts
│  └─ services/     ドメインロジック（フェーズ遷移・集計・CSV・エクスポート）
├─ components/ features/ hooks/
├─ lib/             Zod スキーマ・型・定数・enum（サーバ / クライアント共有）
└─ styles/          Tailwind エントリ、縦書きユーティリティ
migrations/         drizzle-kit 生成の D1 マイグレーション
test/               server（Vitest）/ e2e（Playwright）
```

## アーキテクチャ指針

### モデル構成（詳細は SPEC.md「7. データモデル」）

- User: パスキー認証、複数の結社に所属可能。俳号は1つ。`public_id` で個人俳句一覧を公開
- Organization（結社）: メンバー・管理者・副管理者。`status` で開放/閉鎖
- Kukai（句会）: 結社に属し、フェーズと設定を持つ。論理削除対応
- Submission（投句）: 作者は `authors_revealed_at` 設定まで匿名（サーバ側でマスク）
- Selection（選句）: 特選・並選・逆選。種別ごとに点数（逆選は負値）
- Comment: 選句中は自分のみ可視、結果発表後に全員公開
- GuestParticipant: ゲストコードで句会に参加（コードがあれば複数句会に並行参加可）。1ゲストセッションに句会ごとの行を `session_id` で紐づけ。権限は参加時点のスナップショット

### 主要な設計判断

1. **論理削除**: 句会は原則 `deleted_at` による論理削除（復活可能）。物理削除はシステム管理者の明示操作のみ
2. **セキュリティ**:
   - 公開 URL は連番を使わず UUID / 推測困難トークン（`kukai.id`, `organizations.id`, `users.public_id`, `guest_codes.code`）
   - パスキー認証のみ（パスワードなし）
   - セッション Cookie は `__Host-` + `Secure` + `HttpOnly` + `SameSite=Lax`
   - 状態変更（action・POST）は `Origin` / `Sec-Fetch-Site` を検証（CSRF 対策）
   - 認証・登録・ゲスト参加はレート制限（KV）
   - ゲストアクセスはコードで発行、有効期限3ヶ月
3. **フェーズ**: 句会は定義済みフェーズの状態機械。**遷移は主催者の手動操作のみ**（`advance` / `rewind` / `extend`）。`scheduled_*_at` は UI 上の「目安」で、到達しても自動遷移しない。全遷移を `kukai_phase_events` に記録
4. **画面反映**: 句会画面は `useFetcher` で `GET /api/kukai/:kukaiId/state`（リソースルート）を約15秒間隔で取得し、`phase` や主要カウンタが変化したら `useRevalidator().revalidate()` で loader を再実行（タブ非アクティブ時は停止）
5. **縦書き表示**: 句カード・選句シート・個人俳句一覧は CSS（`writing-mode: vertical-rl`）で縦書き。管理系 UI は横書き
6. **エクスポート形式**:
   - 句会: テキスト、CSV（メタデータ付き、UTF-8 + BOM）
   - 個人俳句: テキストのみ（PDF はスコープ外）
7. **権限判定**: `app/server/authz.server.ts` に集約し、loader / action から宣言的に呼び出す
8. **匿名性**: `authors_revealed_at` 未設定の間、投句作者は loader / リソースルートのレスポンス整形時に確実に落とす
9. **規模の想定**: 結社 < 100、1 結社あたりメンバー最大 100 人（多くは 20〜30 人）。性能はスタック選定の決め手にせず、D1 単一ライターで詰まらない前提。詳細は SPEC.md「12.2」

### データベースの考慮点

- D1（SQLite）。書き込みは直列
- データの自動削除は行わない
- 論理削除を指定箇所で実装
- UUID 参照、結社/句会クエリ向けのインデックスを用意（SPEC.md「7.3」）
- 一覧はほぼ一括取得でよい。投句一覧・通知など増え得るものだけカーソルページング
- バルク処理（CSV インポート、集計）は Workers の CPU / サブリクエスト上限に配慮し分割

### フロントエンド指針

- サーバ状態は RR の loader が担う。データ取得ライブラリ（TanStack Query 等）は入れない。action 成功後は RR が loader を自動再検証
- グローバルなクライアント状態管理ライブラリは入れない。UI ローカル状態は `useState`、共有したい状態は URL 検索パラメータ
- Turbo/Stimulus は使わない
- Tailwind で styling。縦書き用のカスタムユーティリティを持つ
- モバイルファーストのレスポンシブ設計
- loader/action の入力検証とフォームのクライアント検証で `app/lib` の Zod スキーマを共有

## テスト戦略

- すべての権限境界をテスト（システム管理者・結社管理者・副管理者・メンバー・句会主催者・ゲスト・未認証）
- loader / action をモックした `Request` + テスト用 D1 で直接呼び、返り値・リダイレクト・ステータスを検証
- フェーズ遷移（advance / rewind / extend）とフェーズ外操作の拒否、締切時のシャッフル
- 匿名性（作者情報のレスポンス漏れがないこと）
- 選句ルール（自句禁止、種別上限、集計スコアの符号）
- ゲストの複数句会並行参加、`:kukaiId` による権限スコープ、未参加句会への操作拒否
- エクスポート / インポートの内容と文字コード
- パスキー認証フロー（登録・ログイン・認証子追加/削除、セッション期限）
- E2E は Playwright + 仮想認証子（CDP WebAuthn ドメイン）

## ドキュメント更新ルール

- モデル（`app/server/db/schema.ts`）を変更したら `SPEC.md`「7. データモデル」を更新する
- ルート（`app/routes.ts`）や loader / action の入出力を変更したら `SPEC.md`「10. ルーティングとデータ規約」を更新する
