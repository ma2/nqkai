# 句会Webアプリケーション 仕様書 Ver1.0.0

オンラインで句会（くかい）を開催・管理できるWebアプリケーション。結社（けっしゃ）機能を持ち、パスキー認証によるセキュアなユーザー管理を行う。

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
| ゲスト参加者 | | 結社に属さず、ゲストコードで単一の句会に参加する参加者 |

---

## 2. 技術スタック

| 分類 | 採用技術 |
|------|----------|
| 実行環境 | Cloudflare Workers（単一Worker + Static Assets） |
| 言語 | TypeScript |
| バックエンドフレームワーク | Hono（`/api/*` の JSON API） |
| フロントエンド | React（Vite ビルドの SPA） |
| ルーティング（FE） | React Router |
| データベース | Cloudflare D1（SQLite） |
| ORM / マイグレーション | Drizzle ORM + drizzle-kit |
| オブジェクトストレージ | Cloudflare R2（プロフィール画像） |
| KV（短命データ） | Cloudflare KV（WebAuthn チャレンジ、レート制限カウンタ） |
| 認証 | パスキー（WebAuthn）。`@simplewebauthn/server` + `@simplewebauthn/browser` |
| セッション | HttpOnly Cookie + D1 セッションテーブル（サーバ側でオペーク・トークンを検証） |
| CSS | Tailwind CSS |
| バリデーション / 型共有 | Zod（`src/shared` で FE/BE 共有） |
| Lint / Format | Biome |
| 単体・結合テスト | Vitest + `@cloudflare/vitest-pool-workers` |
| E2E テスト | Playwright |
| デプロイ | Wrangler（`wrangler deploy`） |
| ローカル開発 | `@cloudflare/vite-plugin` による Vite + Workers 統合 dev サーバ |

> バックエンドの技術選定（Drizzle / セッション方式 / WebAuthn ライブラリ等）は、本仕様書のレビュー時に再確認する前提の「たたき台」である。

### 採用しないもの（明確な非採用）

- **メール送信基盤**：結社参加は Web 上の申請 → オーナー承認で完結させる。承認・却下・フェーズ変更などの通知は**アプリ内通知のみ**。
- **リアルタイム更新（WebSocket / Durable Objects / SSE）**：フェーズ状態は**軽いポーリング**で画面へ反映する。
- **フェーズ自動遷移（Cron Triggers / DO Alarm）**：フェーズ遷移は**主催者の手動操作のみ**。時刻設定は「目安」として保持・表示する。
- **サーバサイドの PDF 生成**：Workers の制約により当面スコープ外。エクスポートはテキスト / CSV のみ。縦書きは画面表示（CSS）で対応する。

---

## 3. アーキテクチャ

### 3.1 全体像

```
                 ┌──────────────────────────── Cloudflare Worker ─────────────────────────────┐
 ブラウザ ──────▶│  Hono app                                                                 │
 (React SPA)      │   ├─ GET  /api/*        … JSON API（認証・結社・句会・投句・選句 …）        │
                  │   ├─ その他パス          … Static Assets バインディングへフォールバック     │
                  │   │                        （SPA。存在しないパスは index.html を返す）      │
                  │   └─ ミドルウェア         … セッション解決 / 権限チェック / レート制限        │
                  │                                                                           │
                  │   バインディング:  DB (D1)   BUCKET (R2)   KV (KV)   ASSETS (Static Assets)  │
                  └───────────────────────────────────────────────────────────────────────────┘
```

- **1 Worker に FE と BE を同居**させる。React のビルド成果物は Static Assets として配信し、`/api/*` 以外の GET は SPA エントリ（`index.html`）にフォールバックする。
- API は REST 準拠の JSON。リクエスト／レスポンスの型は `src/shared` の Zod スキーマから導出し、FE の fetch ラッパで再利用する。
- ドメインロジックは `src/worker/services` に集約し、ルートハンドラは「入力検証 → サービス呼び出し → 整形」に徹する。

### 3.2 環境

| 環境 | 用途 | D1 | 備考 |
|------|------|----|------|
| local | 開発 | ローカル D1（Miniflare） | `vite dev` + Workers |
| preview | PR / 動作確認 | preview 用 D1 | Wrangler の環境設定で分離 |
| production | 本番 | 本番 D1 | `wrangler deploy` |

シークレット（WebAuthn RP 設定、Cookie 署名鍵など）は `wrangler secret` で管理する。

---

## 4. プロジェクト構成

```
/
├─ CLAUDE.md                     Claude Code 向けガイド
├─ SPEC.md                       本仕様書
├─ package.json
├─ pnpm-lock.yaml
├─ wrangler.jsonc                Worker 設定・バインディング
├─ vite.config.ts               @cloudflare/vite-plugin
├─ tsconfig.json
├─ tailwind.config.ts
├─ biome.json
├─ drizzle.config.ts
├─ migrations/                   drizzle-kit が生成する D1 マイグレーション SQL
├─ src/
│  ├─ worker/                    Hono バックエンド
│  │  ├─ index.ts                エントリ（Hono app、assets フォールバック）
│  │  ├─ routes/                 機能別ルータ（auth, orgs, kukai, submissions, …）
│  │  ├─ middleware/             session / authz / rate-limit / error
│  │  ├─ services/               ドメインロジック（権限判定・フェーズ遷移・集計 …）
│  │  ├─ db/
│  │  │  ├─ schema.ts            Drizzle スキーマ定義
│  │  │  └─ client.ts            drizzle(d1) の生成
│  │  └─ lib/                    webauthn / session / csv / export / id
│  ├─ client/                    React SPA
│  │  ├─ main.tsx
│  │  ├─ routes/                 画面（ルート）コンポーネント
│  │  ├─ features/               機能単位のコンポーネント群
│  │  ├─ components/             汎用 UI（縦書きコンポーネント含む）
│  │  ├─ api/                    fetch ラッパ + 型付きクライアント
│  │  ├─ hooks/                  usePolling など
│  │  └─ styles/                 Tailwind エントリ、縦書きユーティリティ
│  └─ shared/                    Zod スキーマ・型・定数・enum（FE/BE 共有）
├─ test/
│  ├─ worker/                    Vitest（vitest-pool-workers）
│  └─ e2e/                       Playwright
└─ public/                       favicon 等の静的ファイル
```

---

## 5. 認証・セッション設計

### 5.1 パスキー（WebAuthn）

- ユーザー登録は必須。ID/パスワードは持たず、認証子（パスキー）のみで認証する。
- ライブラリ：サーバ `@simplewebauthn/server`、ブラウザ `@simplewebauthn/browser`。
- RP 設定は環境変数（`WEBAUTHN_RP_ID`, `WEBAUTHN_RP_NAME`, `WEBAUTHN_ORIGIN`）。

#### 登録フロー（新規ユーザー）

1. `POST /api/auth/register/options` … メールアドレス・俳号を受け取り、`generateRegistrationOptions()` を実行。チャレンジを KV に `reg:<tempId>` で TTL 5分保存し、`tempId` を返す。
2. ブラウザで `startRegistration()`。
3. `POST /api/auth/register/verify` … `tempId` と attestation を受け取り `verifyRegistrationResponse()`。成功したら `users` と `webauthn_credentials` を作成し、セッションを発行。

#### 認証子の追加（既存ユーザー）

- ログイン済みユーザーが端末ごとにパスキーを追加できる。`POST /api/auth/credentials/options` → `POST /api/auth/credentials/verify`。
- 1ユーザーが複数の認証子を持てる。認証子には任意の表示名（例：「iPhone」）を付けられる。最後の1つは削除不可。

#### ログインフロー

1. `POST /api/auth/login/options` … メールアドレス（任意。省略時は discoverable credential を許可）を受け取り `generateAuthenticationOptions()`。チャレンジを KV に保存。
2. ブラウザで `startAuthentication()`。
3. `POST /api/auth/login/verify` … `verifyAuthenticationResponse()`。`counter` を更新し、セッションを発行。

### 5.2 セッション

- ログイン成功時、ランダム 32 バイトのトークンを生成。**ハッシュ（SHA-256）を `sessions.id` に保存**し、生トークンを Cookie で配布する。
- Cookie 名：`__Host-session`。属性：`Secure; HttpOnly; SameSite=Lax; Path=/`。
- 有効期限：発行から 30 日（`sessions.expires_at`）。アクセスごとにスライド延長（残り 7 日を切ったら再発行）。
- ミドルウェア `session` が毎リクエストで Cookie → `sessions` → `users` または `guest_participants` を解決し、`c.set('auth', …)` に載せる。
- ログアウトは該当セッション行を削除。「全端末からログアウト」で当該ユーザーの全セッションを削除。

### 5.3 ゲストセッション

- ゲストは `guest_participants` に紐づくセッションを持つ（`sessions.user_id` は NULL、`sessions.guest_participant_id` を設定）。
- ゲストセッションの有効期限はゲストコードの有効期限（発行から3ヶ月）を上限とする。
- ゲストは自分が参加した1句会のスコープ内でのみ操作でき、他画面へはアクセスできない。

### 5.4 システム管理者

- `users.is_system_admin = true` のユーザー。付与は seed もしくは管理コンソール（`rails console` 相当のスクリプト）で行う。UI 上の昇格導線は持たない。

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
| 投句 | — | 参加者として | 参加者として | 参加者として | 参加者として | 許可時のみ |
| 選句 | — | 参加者として | 参加者として | 参加者として | 参加者として | 許可時のみ |
| コメント | — | 参加者として | 参加者として | 参加者として | 参加者として | 許可時のみ |
| 自分の投句の削除 | ✓ | — | — | 自句のみ | 自句のみ | 締切前の自句のみ |

権限判定は `src/worker/services/authz.ts` に集約し、ルートで宣言的に呼び出す。

---

## 7. データモデル

### 7.1 ER 図

```
User ||--o{ WebauthnCredential
User ||--o{ Session
User ||--o{ OrganizationMembership
User ||--o{ OrganizationJoinRequest
User ||--o{ Notification
User ||--o{ Kukai : "organizes"
User ||--o{ Submission : "authors (member)"
User ||--o{ Selection : "selects (member)"
User ||--o{ Comment  : "writes (member)"

Organization ||--o{ OrganizationMembership
Organization ||--o{ OrganizationJoinRequest
Organization ||--o{ Kukai : "hosts"

Kukai ||--o{ Submission
Kukai ||--o{ GuestCode
Kukai ||--o{ GuestParticipant
Kukai ||--o{ KukaiPhaseEvent
Kukai ||--o{ CsvImport (via Organization)

GuestCode ||--o{ GuestParticipant
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
| user_id | TEXT NULL FK → users | 会員セッション |
| guest_participant_id | TEXT NULL FK → guest_participants | ゲストセッション |
| user_agent | TEXT NULL | |
| created_at | INTEGER | |
| expires_at | INTEGER | |

制約：`user_id` と `guest_participant_id` はどちらか一方のみ非 NULL。

#### organizations（結社）

| カラム | 型 | 説明 |
|--------|----|----|
| id | TEXT PK | UUID（公開 URL に使用） |
| name | TEXT | |
| description | TEXT | |
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
| kukai_id | TEXT FK → kukai | |
| guest_code_id | TEXT FK → guest_codes | |
| display_name | TEXT | 「ゲスト1」「ゲスト2」…（句会内連番） |
| can_submit / can_select / can_comment | INTEGER | 参加時点の権限スナップショット |
| created_at / last_seen_at | INTEGER | |

制約：`UNIQUE(kukai_id, display_name)`。

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
| type | TEXT | `join_request_received` / `join_approved` / `join_rejected` / `phase_changed` / `kukai_deleted` など |
| payload | TEXT | JSON（結社 ID、句会 ID、フェーズ名など） |
| read_at | INTEGER NULL | |
| created_at | INTEGER | |

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
- 一覧系：`kukai(organization_id, phase, deleted_at)`, `submissions(kukai_id)`, `selections(kukai_id)`, `comments(kukai_id, submission_id)`, `organization_memberships(user_id)`, `organization_memberships(organization_id, role)`, `notifications(user_id, read_at)`, `organization_join_requests(organization_id, status)`。
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
- フェーズ変更時、当該句会の参加者（会員のみ）に `phase_changed` のアプリ内通知を作成する。

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

- 作成：任意のログインユーザーが名称・説明を指定して作成。作成者が `admin`。
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
  - コードが有効・未失効・期限内・上限内なら `guest_participants` を作成（表示名は「ゲスト N」の連番。希望名があれば `ゲストN（希望名）` 等の形式は将来検討）。
  - 権限は句会設定のスナップショット（`can_submit` 等）。
  - ゲストセッションを発行。
- **1人のゲストは同時に1つの句会にのみ参加できる**（ブラウザ単位。既にゲストセッションがある状態で別コードに参加しようとしたら拒否、または現行セッションを破棄して切替）。
  - 注：旧要件「複数句会への同時参加は不可」は本仕様ではゲストに適用する解釈とする。会員は複数句会に参加可能。**要レビュー確認。**
- 終了した句会もゲストコードが有効な限り閲覧可能。

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

- 対象イベント：結社参加申請の受信、参加承認 / 却下、句会のフェーズ変更、句会の論理削除、（システム管理者による）コンテンツ削除・アカウント停止。
- `GET /api/notifications`（ページング）、`POST /api/notifications/:id/read`、`POST /api/notifications/read-all`。
- ヘッダの通知ベルに未読数。ポーリングまたは画面遷移時に取得。
- **メール送信は行わない。**

### 9.11 システム管理

- 全結社・全句会の閲覧・管理（論理削除・復活、閉鎖の強制解除など）。
- 不適切コンテンツ（投句・コメント）の削除。
- ユーザーアカウントの停止（`status = 'suspended'`）・削除。
- 監査のため主要操作は `kukai_phase_events` 等のログに `actor_id` を残す。管理操作専用ログは将来検討。

---

## 10. API設計

- ベースパス `/api`。認証は Cookie セッション。CSRF 対策として、状態変更系（POST/PUT/PATCH/DELETE）は `Origin` / `Sec-Fetch-Site` を検証し、`SameSite=Lax` Cookie と併用する。
- レスポンスは `{ data: ... }` または `{ error: { code, message, details? } }`。
- バリデーションエラーは 422、認証切れは 401、権限不足は 403、未存在は 404、フェーズ不整合などの業務エラーは 409。
- 一覧は `?limit=&cursor=` のカーソルページング。

### 10.1 エンドポイント一覧（抜粋）

| メソッド・パス | 概要 | 権限 |
|----------------|------|------|
| `POST /api/auth/register/options` `.../verify` | パスキー登録 | 未認証 |
| `POST /api/auth/login/options` `.../verify` | パスキーログイン | 未認証 |
| `POST /api/auth/logout` | ログアウト | 本人 |
| `GET  /api/auth/credentials` / `POST .../options` `.../verify` / `DELETE .../:id` | 認証子の管理 | 本人 |
| `GET  /api/me` / `PATCH /api/me` | 自分のプロフィール取得・更新 | 本人 |
| `POST /api/me/avatar` / `DELETE /api/me/avatar` | プロフィール画像 | 本人 |
| `POST /api/me/withdraw` | 退会 | 本人 |
| `GET  /api/avatars/:userId` | 画像配信 | 公開 |
| `GET  /api/organizations` / `POST /api/organizations` | 結社一覧・作成 | 一覧:公開 / 作成:会員 |
| `GET  /api/organizations/:id` / `PATCH` | 結社詳細・編集 | 詳細:公開 / 編集:管理者・副管理者 |
| `POST /api/organizations/:id/close` / `.../reopen` | 閉鎖・再開 | 管理者（再開はシステム管理者も） |
| `POST /api/organizations/:id/join-requests` | 参加申請 | 会員 |
| `GET  /api/organizations/:id/join-requests` | 申請一覧 | 管理者・副管理者 |
| `POST /api/join-requests/:id/approve` / `.../reject` | 承認・却下 | 管理者・副管理者 |
| `GET  /api/organizations/:id/members` / `DELETE .../members/:userId` | メンバー一覧・強制退会 | 一覧:メンバー / 退会:管理者・副管理者 |
| `POST /api/organizations/:id/members/:userId/role` | 副管理者の任免 | 管理者 |
| `POST /api/organizations/:id/leave` | 自主退会 | 本人 |
| `POST /api/organizations/:id/imports` / `GET .../imports/:importId` | CSV インポート | 管理者・副管理者 |
| `GET  /api/organizations/:id/kukai` / `POST /api/organizations/:id/kukai` | 句会一覧・作成 | 一覧:閲覧可能者 / 作成:メンバー |
| `GET  /api/kukai/:id` / `PATCH /api/kukai/:id` | 句会詳細・設定変更 | 詳細:閲覧可能者 / 変更:主催者 |
| `GET  /api/kukai/:id/state` | 軽量ポーリング用の状態 | 閲覧可能者 |
| `POST /api/kukai/:id/phase` | フェーズ遷移（advance / rewind / extend） | 主催者 |
| `POST /api/kukai/:id/reveal-authors` | 作者公開 | 主催者 |
| `POST /api/kukai/:id/delete` / `.../restore` | 論理削除・復活 | 主催者・結社管理者・副管理者 |
| `GET  /api/kukai/:id/submissions` / `POST` | 投句一覧・投句 | 閲覧可能者 / 参加者（フェーズ・上限・権限チェック） |
| `PATCH /api/submissions/:id` / `DELETE /api/submissions/:id` | 投句の修正・削除 | 作者本人（`submission` フェーズのみ） |
| `POST /api/submissions/:id/hide` / `.../unhide` | 非表示切替 | 主催者 |
| `GET  /api/kukai/:id/selection-sheet` | 選句用シート（ランダム順、自句・非表示除外） | 参加者 |
| `PUT  /api/submissions/:id/selection` / `DELETE` | 選句の設定・解除 | 参加者（`selection` フェーズ、種別上限、自句禁止） |
| `GET  /api/kukai/:id/results` | 集計結果 | 閲覧可能者（`result` 以降） |
| `GET  /api/submissions/:id/comments` / `POST` | コメント一覧・投稿 | フェーズにより可視範囲が変化 |
| `GET  /api/kukai/:id/guest-codes` / `POST` / `POST .../:codeId/revoke` | ゲストコード管理 | 主催者 |
| `POST /api/guest/join` | ゲスト参加 | 未認証（コード必須） |
| `GET  /api/kukai/:id/export?format=text|csv` | 句会エクスポート | 主催者・結社管理者・副管理者 |
| `GET  /api/u/:publicId/haiku` / `?format=text` | 個人俳句一覧・エクスポート | 公開（本人のみ format 指定可） |
| `GET  /api/notifications` / `POST .../:id/read` / `POST .../read-all` | 通知 | 本人 |
| `GET  /api/admin/organizations` `/api/admin/kukai` `/api/admin/users` ほか | システム管理 | システム管理者 |

### 10.2 型共有

- リクエスト／レスポンスの Zod スキーマを `src/shared/schemas/*` に定義。
- BE：Hono の `zValidator` で入力検証。FE：`src/client/api` の関数が同じスキーマで `parse` する。
- enum（フェーズ、ロール、通知種別、選句種別）は `src/shared/constants.ts` に集約。

---

## 11. フロントエンド設計

### 11.1 ルーティング（React Router、抜粋）

| パス | 画面 | 認証 |
|------|------|------|
| `/` | ダッシュボード（所属結社、進行中の句会、通知） | 要 |
| `/login` `/register` | パスキー認証 | 不要 |
| `/settings` | プロフィール・パスキー管理 | 要 |
| `/orgs` `/orgs/new` `/orgs/:id` | 結社一覧・作成・詳細 | 詳細は一部公開 |
| `/orgs/:id/admin` | 結社管理（申請・メンバー・句会・インポート） | 管理者・副管理者 |
| `/orgs/:id/kukai/new` | 句会作成 | メンバー |
| `/kukai/:id` | 句会トップ（フェーズ別 UI） | 閲覧可能者 |
| `/kukai/:id/submit` | 投句 | 参加者 |
| `/kukai/:id/select` | 選句（縦書きシート） | 参加者 |
| `/kukai/:id/results` | 結果・講評 | 閲覧可能者 |
| `/kukai/:id/manage` | 句会管理（フェーズ制御・非表示・ゲストコード） | 主催者 |
| `/guest?code=...` | ゲスト参加 | 不要 |
| `/u/:publicId` | 個人俳句一覧（公開） | 不要 |
| `/admin/*` | システム管理 | システム管理者 |

### 11.2 状態管理・データ取得

- サーバ状態は TanStack Query（`@tanstack/react-query`）。ミューテーション成功時に関連クエリを invalidate。
- 句会画面では `useKukaiState(kukaiId)` フックが `GET /api/kukai/:id/state` を `refetchInterval: 15000`・`refetchIntervalInBackground: false` でポーリング。`phase` や主要カウンタの変化を検知したら関連クエリを invalidate する。
- 認証状態は `GET /api/me` の結果をアプリ全体で共有。401 を受けたら `/login` へ。

### 11.3 縦書き表示

- Tailwind に縦書きユーティリティを追加：
  - `.tategaki { writing-mode: vertical-rl; text-orientation: upright; line-break: strict; }`
  - 数字・英字の向き、拗促音の扱い、ルビ有無は実装時に詰める。
- 句カード／選句シート／個人俳句一覧は縦書き。管理系 UI は横書き。
- モバイルファースト。縦書きブロックは横スクロール可能なコンテナに入れる。

### 11.4 その他 UI 要件

- レスポンシブ（モバイル対応必須）。
- モダンブラウザ全般に対応。オフライン非対応。スマホネイティブアプリは作らない。

---

## 12. 非機能要件

### 12.1 Cloudflare 由来の制約と方針

| 項目 | 制約 | 方針 |
|------|------|------|
| Workers CPU 時間 | リクエストあたり上限あり | 集計・エクスポート・CSV インポートは重い処理を分割。N+1 を避け D1 クエリをまとめる |
| D1 | SQLite。書き込みは直列。1クエリの結果サイズ・バインド数に上限 | 一覧はページング。バルク投入はバッチ（`batch()`）分割 |
| サブリクエスト数 | 1リクエストで上限あり | R2 への多数アクセスを避け、画像は1リクエスト1オブジェクト |
| Cron / バックグラウンド | 本仕様では不使用 | 期限切れセッション掃除はアクセス時の遅延削除、または管理スクリプト |
| リアルタイム | DO/WS 不使用 | ポーリング（「8.4」） |

### 12.2 性能

- 同時参加者数・同時開催句会数に固定上限は設けない（D1 の書き込み直列性がボトルネックになり得る点は運用で監視）。
- 一覧 API はカーソルページング必須。

### 12.3 セキュリティ

- 認証はパスキーのみ。パスワードは持たない。
- 公開 URL は連番を使わず UUID / 推測困難トークン（`kukai.id`, `organizations.id`, `users.public_id`, `guest_codes.code`）。
- セッション Cookie は `__Host-` プレフィックス + `Secure` + `HttpOnly` + `SameSite=Lax`。
- 状態変更 API は `Origin` / `Sec-Fetch-Site` 検証で CSRF 対策。
- 認証・ゲスト参加・登録オプション取得はレート制限（KV カウンタ、IP + 対象キー単位）。
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
| 実行基盤 | Rails サーバ | Cloudflare Workers（単一 Worker） |
| 言語 | Ruby | TypeScript |
| API/ビュー | Rails MVC + Turbo/Stimulus | Hono JSON API + React SPA |
| DB | SQLite（自前） | Cloudflare D1 |
| ORM | Active Record | Drizzle ORM |
| 認証実装 | Rails + パスキー gem | `@simplewebauthn/*` + D1 セッション |
| 画像保存 | Active Storage 等 | Cloudflare R2 |
| メール通知 | ActionMailer | **廃止**（Web 申請 → オーナー承認、アプリ内通知のみ） |
| フェーズ自動遷移 | ジョブ / cron 想定 | **廃止**（主催者の手動操作のみ、時刻は目安表示） |
| リアルタイム更新 | WebSocket（任意） | **廃止**（軽いポーリング） |
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
- ゲストの希望表示名の扱い、ゲストの複数句会参加可否の緩和。
- 管理操作専用の監査ログ。
- サポート体制、退会時のデータ扱いのポリシー明文化。

---

## 15. 開発ロードマップ

MVP は **フェーズ3 完了時点**（登録・ログイン、結社の作成・参加、句会の1サイクル、基本権限）。

### フェーズ1：基盤

- Wrangler / Vite / D1 / R2 / KV のセットアップ、`wrangler.jsonc` バインディング
- Drizzle スキーマ + 初期マイグレーション + seed
- パスキー登録・ログイン・セッション・認証子管理
- ユーザーモデル（俳号、プロフィール画像 = R2）
- ログイン / 登録 / ダッシュボードの基本 UI、レスポンシブ土台、縦書きユーティリティ

### フェーズ2：結社

- 結社の作成・編集・一覧・詳細
- 参加申請 → 承認 / 却下（アプリ内通知）
- メンバー一覧、自主退会・強制退会
- 管理者・副管理者の権限、結社の閉鎖・再開

### フェーズ3：句会の基本サイクル（MVP）

- 句会の作成（全設定項目）・詳細
- フェーズ状態機械 + 手動遷移 + `phase_events` + ポーリング（`/state`）
- 投句（追加・修正・削除、上限、締切時シャッフル）
- 選句（ランダム表示、特選・並選・逆選、上限、自句禁止）
- 選句中コメント（自分のみ可視）
- 集計・順位・作者公開制御・コメント公開

### フェーズ4：ゲスト・表示・エクスポート

- ゲストコード発行、ゲスト参加・権限制御、連番表示名、ゲストセッション
- 縦書きの句カード・選句シート・句会詳細
- 個人投句一覧（`/u/:publicId`）
- 句会エクスポート（テキスト / CSV）、個人俳句エクスポート（テキスト）

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
- モデル（`src/worker/db/schema.ts`）を変更したら本仕様書の「7. データモデル」を更新する。

---

## 16. 開発環境・コマンド

前提：Node.js LTS、pnpm、Cloudflare アカウント、Wrangler ログイン済み。

```bash
# 依存インストール
pnpm install

# ローカル開発（Vite + Workers 統合。D1/R2/KV はローカルエミュレーション）
pnpm dev

# D1 マイグレーション
pnpm drizzle-kit generate           # schema.ts から migrations/ を生成
pnpm wrangler d1 migrations apply nqkai --local     # ローカル適用
pnpm wrangler d1 migrations apply nqkai --remote    # 本番適用

# seed（初期データ・システム管理者の作成）
pnpm seed:local
pnpm seed:remote

# 型チェック / Lint / Format
pnpm typecheck
pnpm lint
pnpm format

# テスト
pnpm test            # Vitest（vitest-pool-workers）
pnpm test:e2e        # Playwright

# ビルド / デプロイ
pnpm build
pnpm wrangler deploy

# シークレット登録（例）
pnpm wrangler secret put SESSION_SIGNING_KEY
```

`wrangler.jsonc` のバインディング（想定）：

| バインディング | 種別 | 用途 |
|----------------|------|------|
| `DB` | D1 | 主データベース |
| `BUCKET` | R2 | プロフィール画像 |
| `KV` | KV | WebAuthn チャレンジ、レート制限 |
| `ASSETS` | Static Assets | React ビルド成果物の配信 |

環境変数：`WEBAUTHN_RP_ID` / `WEBAUTHN_RP_NAME` / `WEBAUTHN_ORIGIN`、シークレット：`SESSION_SIGNING_KEY` ほか。

---

## 17. テスト戦略

- **権限境界**：システム管理者・結社管理者・副管理者・メンバー・句会主催者・ゲスト・未認証の各ロールで、許可／拒否を網羅的にテスト。
- **フェーズ遷移**：`advance` / `rewind` / `extend` の各遷移、フェーズ外操作の拒否（投句を `submission` 以外で行う等）、締切時のシャッフル。
- **匿名性**：`authors_revealed_at` 未設定時に作者情報が API レスポンスへ漏れないこと。
- **選句ルール**：自句選句の拒否、種別上限の超過、選び直し・取り消し、非表示句の除外、集計スコア（逆選の負値含む）。
- **ゲスト**：コードの期限切れ・失効・上限超過、権限スナップショット、連番表示名、単一句会制約。
- **エクスポート／インポート**：テキスト / CSV の内容と文字コード、CSV インポートの行単位検証と履歴。
- **認証**：パスキー登録・ログイン・認証子追加／削除、セッションの有効期限とスライド延長、ログアウト（単一・全端末）。
- **E2E（Playwright）**：登録 → 結社作成 → 句会作成 → 投句 → 選句 → 結果発表 の一連フロー、ゲスト参加フロー。WebAuthn は仮想認証子（CDP `WebAuthn` ドメイン）で実行。
