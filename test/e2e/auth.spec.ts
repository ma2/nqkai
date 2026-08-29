import { expect, test } from "@playwright/test";

/**
 * パスキー認証の一連フローを CDP の仮想認証子で検証する。
 * 登録 → ダッシュボード → リロードでセッション維持 → ログアウト → 再ログイン。
 */
test("register → dashboard → logout → login", async ({ page, context }) => {
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

  const email = `e2e-${Date.now()}@example.com`;

  // --- 新規登録 ---
  await page.goto("/register");
  await page.getByLabel("メールアドレス").fill(email);
  await page.getByLabel("俳号（表示名）").fill("E2E俳号");
  await page.getByRole("button", { name: "パスキーを作成して登録" }).click();

  await expect(page).toHaveURL("/");
  await expect(page.getByRole("heading", { name: /ようこそ、E2E俳号/ })).toBeVisible();

  // --- セッション維持（リロード） ---
  await page.reload();
  await expect(page.getByRole("heading", { name: /ようこそ、E2E俳号/ })).toBeVisible();

  // --- ログアウト ---
  await page.getByRole("button", { name: "ログアウト" }).click();
  await expect(page).toHaveURL("/login");

  // --- 再ログイン ---
  await page.getByLabel("メールアドレス").fill(email);
  await page.getByRole("button", { name: "パスキーでログイン" }).click();
  await expect(page).toHaveURL("/");
  await expect(page.getByRole("heading", { name: /ようこそ、E2E俳号/ })).toBeVisible();
});
