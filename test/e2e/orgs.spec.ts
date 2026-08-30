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

test("結社の作成→参加申請→承認→パスキー復旧", async ({ browser }) => {
  const stamp = Date.now();
  const adminEmail = `org-admin-${stamp}@example.com`;
  const memberEmail = `org-member-${stamp}@example.com`;

  // --- 管理者：登録して結社を作成 ---
  const adminCtx = await browser.newContext();
  const admin = await adminCtx.newPage();
  await addAuthenticator(adminCtx, admin);
  await register(admin, adminEmail, "主宰");

  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
    "base64",
  );

  await admin.goto("/orgs/new");
  await admin.getByLabel("結社名").fill(`テスト結社 ${stamp}`);
  await admin.getByLabel("説明（任意）").fill("E2E 用");
  await admin
    .getByLabel(/画像（任意/)
    .setInputFiles({ name: "org.png", mimeType: "image/png", buffer: png });
  await admin.getByRole("button", { name: "作成" }).click();
  await expect(admin).toHaveURL(/\/orgs\/[0-9a-f-]{36}$/);
  const orgUrl = admin.url();
  await expect(admin.getByText(/あなたの役割：管理者/)).toBeVisible();
  // 画像が配信される
  await expect(admin.locator('img[src*="/api/orgs/"]')).toBeVisible();

  // --- メンバー：登録して参加申請 ---
  const memberCtx = await browser.newContext();
  const member = await memberCtx.newPage();
  await addAuthenticator(memberCtx, member);
  await register(member, memberEmail, "門人");

  await member.goto(orgUrl);
  await member.getByRole("button", { name: "参加を申請" }).click();
  await expect(member.getByText("参加申請を送信しました")).toBeVisible();

  // --- 管理者：承認 ---
  await admin.goto(`${orgUrl}/admin`);
  await expect(admin.getByText("門人")).toBeVisible();
  await admin.getByRole("button", { name: "承認" }).click();
  await expect(admin.getByText("参加を承認しました")).toBeVisible();

  // --- メンバー：役割が反映される ---
  await member.goto(orgUrl);
  await expect(member.getByText(/あなたの役割：メンバー/)).toBeVisible();

  // --- 管理者：メンバーの復旧コードを発行 ---
  await admin.goto(`${orgUrl}/admin`);
  const memberRow = admin.locator("li", { hasText: "門人" }).first();
  await memberRow.getByRole("button", { name: "復旧コード発行" }).click();
  const codeText = await admin.locator("p.font-mono").first().innerText();
  expect(codeText).toMatch(/^[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/);

  // --- 端末を失ったメンバー（新規コンテキスト）：復旧コードで再登録 ---
  const recoverCtx = await browser.newContext();
  const recover = await recoverCtx.newPage();
  await addAuthenticator(recoverCtx, recover);
  await recover.goto("/recover?mode=code");
  await recover.getByLabel("登録メールアドレス").fill(memberEmail);
  await recover.getByLabel("復旧コード").fill(codeText);
  await recover.getByRole("button", { name: "パスキーを再登録" }).click();
  await expect(recover).toHaveURL("/settings");
  await expect(recover.getByRole("heading", { name: "設定" })).toBeVisible();

  await adminCtx.close();
  await memberCtx.close();
  await recoverCtx.close();
});
