# CLAUDE.md

このファイルは、本リポジトリで作業する Claude Code (claude.ai/code) 向けのガイドである。

## プロジェクト概要

オンライン句会（句会）を開催・管理する Web アプリケーション。結社（結社）機能を持ち、パスキー認証によるセキュアなユーザー管理を行う。詳細な要件・設計・データモデル・API・ロードマップは `SPEC.md` に集約している。**実装前に必ず `SPEC.md` を参照すること。**

## 技術スタック

- 実行環境: Cloudflare Workers（単一 Worker + Static Assets）
- 言語: TypeScript
- バックエンド: Hono（`/api/*` の JSON API）
- フロントエンド: React + Vite（SPA）、React Router、TanStack Query
- データベース: Cloudflare D1（SQLite）
- ORM: Drizzle ORM + drizzle-kit
- ストレージ: Cloudflare R2（プロフィール画像）、Cloudflare KV（WebAuthn チャレンジ・レート制限）
- 認証: パスキー（WebAuthn）。`@simplewebauthn/server` + `@simplewebauthn/browser`
- セッション: HttpOnly Cookie + D1 セッションテーブル
- CSS: Tailwind CSS
- 型・バリデーション共有: Zod（`src/shared`）
- Lint/Format: Biome
- テスト: Vitest + `@cloudflare/vitest-pool-workers`、E2E は Playwright
- デプロイ: Wrangler

### 採用しないもの

- メール送信基盤（結社参加は Web 申請 → オーナー承認。通知はアプリ内通知のみ）
- リアルタイム更新（WebSocket / Durable Objects / SSE）。フェーズ状態は軽いポーリングで反映
- フェーズの時刻ベース自動遷移（Cron Triggers / DO Alarm）。遷移は主催者の手動操作のみ
- サーバサイドの PDF 生成（当面スコープ外。縦書きは画面表示のみ）

## 開発コマンド

```bash
pnpm install

# ローカル開発（Vite + Workers 統合。D1/R2/KV はローカルエミュレーション）
pnpm dev

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
pnpm build
pnpm wrangler deploy
```

## プロジェクト構成

```
src/
├─ worker/          Hono バックエンド
│  ├─ index.ts      エントリ（Hono app、assets フォールバック）
│  ├─ routes/       機能別ルータ
│  ├─ middleware/   session / authz / rate-limit / error
│  ├─ services/     ドメインロジック（権限判定・フェーズ遷移・集計）
│  ├─ db/           schema.ts（Drizzle）/ client.ts
│  └─ lib/          webauthn / session / csv / export / id
├─ client/          React SPA（routes / features / components / api / hooks / styles）
└─ shared/          Zod スキーマ・型・定数・enum（FE/BE 共有）
migrations/         drizzle-kit 生成の D1 マイグレーション
test/               worker（Vitest）/ e2e（Playwright）
```

## アーキテクチャ指針

### モデル構成（詳細は SPEC.md「7. データモデル」）

- User: パスキー認証、複数の結社に所属可能。俳号は1つ。`public_id` で個人俳句一覧を公開
- Organization（結社）: メンバー・管理者・副管理者。`status` で開放/閉鎖
- Kukai（句会）: 結社に属し、フェーズと設定を持つ。論理削除対応
- Submission（投句）: 作者は `authors_revealed_at` 設定まで匿名（サーバ側でマスク）
- Selection（選句）: 特選・並選・逆選。種別ごとに点数（逆選は負値）
- Comment: 選句中は自分のみ可視、結果発表後に全員公開
- GuestParticipant: ゲストコードで単一句会に参加。権限は参加時点のスナップショット

### 主要な設計判断

1. **論理削除**: 句会は原則 `deleted_at` による論理削除（復活可能）。物理削除はシステム管理者の明示操作のみ
2. **セキュリティ**:
   - 公開 URL は連番を使わず UUID / 推測困難トークン（`kukai.id`, `organizations.id`, `users.public_id`, `guest_codes.code`）
   - パスキー認証のみ（パスワードなし）
   - セッション Cookie は `__Host-` + `Secure` + `HttpOnly` + `SameSite=Lax`
   - 状態変更 API は `Origin` / `Sec-Fetch-Site` を検証（CSRF 対策）
   - 認証・登録・ゲスト参加はレート制限（KV）
   - ゲストアクセスはコードで発行、有効期限3ヶ月
3. **フェーズ**: 句会は定義済みフェーズの状態機械。**遷移は主催者の手動操作のみ**（`advance` / `rewind` / `extend`）。`scheduled_*_at` は UI 上の「目安」で、到達しても自動遷移しない。全遷移を `kukai_phase_events` に記録
4. **画面反映**: 句会画面は `GET /api/kukai/:id/state` を約15秒間隔でポーリングし、`phase` や主要カウンタの変化で関連クエリを invalidate（タブ非アクティブ時は停止）
5. **縦書き表示**: 句カード・選句シート・個人俳句一覧は CSS（`writing-mode: vertical-rl`）で縦書き。管理系 UI は横書き
6. **エクスポート形式**:
   - 句会: テキスト、CSV（メタデータ付き、UTF-8 + BOM）
   - 個人俳句: テキストのみ（PDF はスコープ外）
7. **権限判定**: `src/worker/services/authz.ts` に集約し、ルートで宣言的に呼び出す
8. **匿名性**: `authors_revealed_at` 未設定の間、投句作者はレスポンス整形時に確実に落とす

### データベースの考慮点

- D1（SQLite）。書き込みは直列
- データの自動削除は行わない
- 論理削除を指定箇所で実装
- UUID 参照、結社/句会クエリ向けのインデックスを用意（SPEC.md「7.3」）
- 一覧 API はカーソルページング必須
- バルク処理（CSV インポート、集計）は Workers の CPU / サブリクエスト上限に配慮し分割

### フロントエンド指針

- サーバ状態は TanStack Query。ミューテーション成功時に関連クエリを invalidate
- Turbo/Stimulus は使わない（React SPA + JSON API）
- Tailwind で styling。縦書き用のカスタムユーティリティを持つ
- モバイルファーストのレスポンシブ設計
- FE/BE で Zod スキーマ（`src/shared`）を共有

## テスト戦略

- すべての権限境界をテスト（システム管理者・結社管理者・副管理者・メンバー・句会主催者・ゲスト・未認証）
- フェーズ遷移（advance / rewind / extend）とフェーズ外操作の拒否、締切時のシャッフル
- 匿名性（作者情報のレスポンス漏れがないこと）
- 選句ルール（自句禁止、種別上限、集計スコアの符号）
- エクスポート / インポートの内容と文字コード
- パスキー認証フロー（登録・ログイン・認証子追加/削除、セッション期限）
- E2E は Playwright + 仮想認証子（CDP WebAuthn ドメイン）

## ドキュメント更新ルール

- モデル（`src/worker/db/schema.ts`）を変更したら `SPEC.md`「7. データモデル」を更新する
- API を追加・変更したら `SPEC.md`「10. API設計」を更新する
