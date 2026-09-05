import { type BrowserContext, expect, type Page, test } from "@playwright/test";

async function addAuthenticator(context: BrowserContext, page: Page) {
  const cdp = await context.newCDPSession(page);
  await cdp.send("WebAuthn.enable");
  await cdp.send("WebAuthn.addVirtualAuthenticator", {
    options: {
      protocol: "ctap2",
      transport: "internal",
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: true,
      automaticPresenceSimulation: true,
    },
  });
}

async function register(page: Page, email: string, haigo: string) {
  await page.goto("/register");
  await page.getByLabel("メールアドレス").fill(email);
  await page.getByLabel("俳号（表示名）").fill(haigo);
  await page.getByRole("button", { name: "パスキーを作成して登録" }).click();
  await expect(page).toHaveURL("/");
}

async function advance(page: Page, times: number) {
  for (let i = 0; i < times; i++) {
    await page.getByRole("button", { name: /に進める →/ }).click();
    await expect(page.getByText("フェーズを更新しました")).toBeVisible();
  }
}

test("句会の1サイクル：作成→投句→選句→結果→作者公開", async ({ browser }) => {
  const s = Date.now();
  const aCtx = await browser.newContext();
  const a = await aCtx.newPage();
  await addAuthenticator(aCtx, a);
  await register(a, `kukai-a-${s}@example.com`, "主宰");

  // 結社を作成
  await a.goto("/orgs/new");
  await a.getByLabel("結社名").fill(`句会テスト結社 ${s}`);
  await a.getByRole("button", { name: "作成" }).click();
  await expect(a).toHaveURL(/\/orgs\/[0-9a-f-]{36}$/);
  const orgUrl = a.url();

  // メンバー B が登録して参加、A が承認
  const bCtx = await browser.newContext();
  const b = await bCtx.newPage();
  await addAuthenticator(bCtx, b);
  await register(b, `kukai-b-${s}@example.com`, "門人");
  await b.goto(orgUrl);
  await b.getByRole("button", { name: "参加を申請" }).click();
  await expect(b.getByText("参加申請を送信しました")).toBeVisible();
  await a.goto(`${orgUrl}/admin`);
  await expect(a.getByText("門人")).toBeVisible();
  await a.getByRole("button", { name: "承認" }).click();
  await expect(a.getByText("参加を承認しました")).toBeVisible();

  // 句会を作成
  await a.goto(`${orgUrl}/kukai/new`);
  await a.getByLabel("句会名").fill(`一月例会 ${s}`);
  await a.getByLabel("兼題（お題）").fill("冬");
  await a.getByLabel("一人あたり投句数").fill("1");
  await a.getByLabel("特選の数").fill("1");
  await a.getByLabel("並選の数").fill("1");
  await a.getByLabel("逆選の数").fill("0");
  await Promise.all([
    a.waitForURL(/\/kukai\/[0-9a-f-]{36}$/),
    a.getByRole("button", { name: "作成（準備中フェーズ）" }).click(),
  ]);
  const kukaiUrl = a.url();

  // 準備中 → 受付開始 → 投句期間
  await advance(a, 2);
  await expect(a.getByText("現在：投句期間")).toBeVisible();

  // A が投句
  await a.getByRole("link", { name: /投句する/ }).click();
  await a.getByPlaceholder("一句").fill("冬の月 主宰の句");
  await a.getByRole("button", { name: "投句" }).click();
  await expect(a.getByText("保存しました")).toBeVisible();

  // B が投句
  await b.goto(kukaiUrl);
  await b.getByRole("link", { name: /投句する/ }).click();
  await b.getByPlaceholder("一句").fill("木枯らし 門人の句");
  await b.getByRole("button", { name: "投句" }).click();
  await expect(b.getByText("保存しました")).toBeVisible();

  // 投句締切 → 選句期間
  await a.goto(kukaiUrl);
  await advance(a, 2);
  await expect(a.getByText("現在：選句期間")).toBeVisible();

  // A は B の句だけが見える → 特選
  await a.getByRole("link", { name: "選句する" }).click();
  await expect(a.getByText("木枯らし 門人の句")).toBeVisible();
  await expect(a.getByText("冬の月 主宰の句")).toHaveCount(0);
  await a.getByRole("button", { name: "特選" }).first().click();
  await expect(a.getByText("選句を保存しました")).toBeVisible();

  // B も A の句を特選
  await b.goto(`${kukaiUrl}/select`);
  await b.getByRole("button", { name: "特選" }).first().click();
  await expect(b.getByText("選句を保存しました")).toBeVisible();

  // 選句締切 → 結果発表
  await a.goto(kukaiUrl);
  await advance(a, 2);
  await expect(a.getByText("現在：結果発表")).toBeVisible();

  // 結果ページ：順位が出る、作者はまだ非公開
  await a.getByRole("link", { name: "結果・講評" }).click();
  await expect(a.getByText(/3点/).first()).toBeVisible();
  await expect(a.getByText(/作者：/)).toHaveCount(0);

  // 作者を公開
  await a.goto(kukaiUrl);
  await a.getByRole("button", { name: "作者を公開する" }).click();
  await expect(a.getByText("作者を公開しました")).toBeVisible();
  await a.getByRole("link", { name: "結果・講評" }).click();
  await expect(a.getByText("作者：門人")).toBeVisible();
  await expect(a.getByText("作者：主宰")).toBeVisible();

  // メンバー B の通知は「旧フェーズから新フェーズに変わりました」形式（issue #11）
  await b.goto("/notifications");
  await expect(
    b.getByText(`「一月例会 ${s}」のフェーズが「投句期間」から「投句締切」に変わりました`),
  ).toBeVisible();

  // 個人の公開句集（作者公開後、句が載る）— フェーズ4
  await b.goto("/settings");
  const publicHref = await b.getByRole("link", { name: /^\/u\// }).getAttribute("href");
  await b.goto(publicHref ?? "/");
  await expect(b.getByRole("heading", { name: "門人 の句" })).toBeVisible();
  await expect(b.getByText("木枯らし 門人の句")).toBeVisible();

  // 句会エクスポート（主催者・テキスト / CSV）— フェーズ4
  const kId = kukaiUrl.split("/").pop();
  const txt = await a.request.get(`/api/kukai/${kId}/export?format=text`);
  expect(txt.ok()).toBeTruthy();
  expect(await txt.text()).toContain("冬の月 主宰の句");
  const csv = await a.request.get(`/api/kukai/${kId}/export?format=csv`);
  expect(csv.headers()["content-type"]).toContain("text/csv");
  expect(await csv.text()).toContain("順位,得点,句,作者,特選,並選,逆選,選者,講評");
  // 非管理者（B）はエクスポート不可
  const denied = await b.request.get(`/api/kukai/${kId}/export?format=text`);
  expect(denied.status()).toBe(403);

  // 講評期間 → 講評締切 → 終了
  await a.goto(kukaiUrl);
  await advance(a, 3);
  await expect(a.getByText("現在：終了")).toBeVisible();

  // ヘッダの「進行中の句会」から句会一覧へ。終了した句会は「過去の句会」に入る（issue #13 / #14）
  await b.goto("/");
  await b.getByRole("link", { name: "進行中の句会" }).click();
  await expect(b).toHaveURL("/kukai");
  const pastSection = b.locator("section", { hasText: "過去の句会" });
  await expect(pastSection.getByRole("link", { name: new RegExp(`一月例会 ${s}`) })).toBeVisible();
  const activeSection = b.locator("section", { hasText: "進行中の句会" });
  await expect(activeSection.getByText("進行中の句会はありません。")).toBeVisible();

  await aCtx.close();
  await bCtx.close();
});

test("ゲスト参加：コード発行→参加→投句→結果に連番表示名", async ({ browser }) => {
  const s = Date.now();
  const aCtx = await browser.newContext();
  const a = await aCtx.newPage();
  await addAuthenticator(aCtx, a);
  await register(a, `guest-a-${s}@example.com`, "主宰");

  await a.goto("/orgs/new");
  await a.getByLabel("結社名").fill(`ゲスト結社 ${s}`);
  await a.getByRole("button", { name: "作成" }).click();
  await expect(a).toHaveURL(/\/orgs\/[0-9a-f-]{36}$/);
  const orgUrl = a.url();

  // ゲスト参加を許可した句会を作成
  await a.goto(`${orgUrl}/kukai/new`);
  await a.getByLabel("句会名").fill(`ゲスト例会 ${s}`);
  await a.getByLabel("兼題（お題）").fill("冬");
  await a.getByLabel("一人あたり投句数").fill("1");
  await a.getByLabel("特選の数").fill("1");
  await a.getByLabel("並選の数").fill("1");
  await a.getByLabel("逆選の数").fill("0");
  await a.getByLabel("ゲスト参加を許可").check();
  await a.getByLabel("投句", { exact: true }).check();
  await a.getByLabel("選句", { exact: true }).check();
  await Promise.all([
    a.waitForURL(/\/kukai\/[0-9a-f-]{36}$/),
    a.getByRole("button", { name: "作成（準備中フェーズ）" }).click(),
  ]);
  const kukaiUrl = a.url();

  // 準備中 → 受付開始 → 投句期間
  await advance(a, 2);
  await expect(a.getByText("現在：投句期間")).toBeVisible();

  // 主催者がゲストコードを発行し、参加リンクを取得
  await a.getByText("ゲスト参加", { exact: true }).click();
  await a.getByRole("button", { name: "コードを発行" }).click();
  await expect(a.getByText("ゲストコードを発行しました")).toBeVisible();
  const link = await a.locator("span", { hasText: "/guest?code=" }).first().textContent();
  expect(link).toContain("/guest?code=");

  // ゲスト（未登録ブラウザ）が参加
  const gCtx = await browser.newContext();
  const g = await gCtx.newPage();
  await g.goto(link!);
  await g.getByRole("button", { name: "参加する" }).click();
  await expect(g).toHaveURL(kukaiUrl);
  await expect(g.getByText("ゲスト参加者として表示しています：ゲスト1")).toBeVisible();

  // ゲストが投句
  await g.getByRole("link", { name: /投句する/ }).click();
  await g.getByPlaceholder("一句").fill("枯野ゆく ゲストの句");
  await g.getByRole("button", { name: "投句" }).click();
  await expect(g.getByText("保存しました")).toBeVisible();

  // 主宰も投句
  await a.goto(kukaiUrl);
  await a.getByRole("link", { name: /投句する/ }).click();
  await a.getByPlaceholder("一句").fill("冬ざれや 主宰の句");
  await a.getByRole("button", { name: "投句" }).click();
  await expect(a.getByText("保存しました")).toBeVisible();

  // 投句締切 → 選句期間：ゲストが主宰の句を特選
  await a.goto(kukaiUrl);
  await advance(a, 2);
  await expect(a.getByText("現在：選句期間")).toBeVisible();
  await g.goto(kukaiUrl);
  await g.getByRole("link", { name: "選句する" }).click();
  await expect(g.getByText("冬ざれや 主宰の句")).toBeVisible();
  await expect(g.getByText("枯野ゆく ゲストの句")).toHaveCount(0);
  await g.getByRole("button", { name: "特選" }).first().click();
  await expect(g.getByText("選句を保存しました")).toBeVisible();

  // 選句締切 → 結果発表 → 作者公開
  await a.goto(kukaiUrl);
  await advance(a, 2);
  await expect(a.getByText("現在：結果発表")).toBeVisible();
  await a.getByRole("button", { name: "作者を公開する" }).click();
  await expect(a.getByText("作者を公開しました")).toBeVisible();
  await a.getByRole("link", { name: "結果・講評" }).click();
  await expect(a.getByText("枯野ゆく ゲストの句")).toBeVisible();
  await expect(a.getByText("作者：ゲスト1")).toBeVisible();

  // ゲストは会員向けダッシュボードにアクセスできない
  await g.goto("/");
  await expect(g).toHaveURL(/\/login/);

  // 2人目のゲストは「ゲスト2」
  const g2Ctx = await browser.newContext();
  const g2 = await g2Ctx.newPage();
  await g2.goto(link!);
  await g2.getByRole("button", { name: "参加する" }).click();
  await expect(g2.getByText("ゲスト参加者として表示しています：ゲスト2")).toBeVisible();

  await aCtx.close();
  await gCtx.close();
  await g2Ctx.close();
});
