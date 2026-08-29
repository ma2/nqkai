import {
  type PublicKeyCredentialCreationOptionsJSON,
  type PublicKeyCredentialRequestOptionsJSON,
  startAuthentication,
  startRegistration,
} from "@simplewebauthn/browser";

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    credentials: "same-origin",
  });
  const data = (await res.json().catch(() => null)) as { error?: string } | null;
  if (!res.ok) {
    throw new Error(data?.error ?? "通信に失敗しました");
  }
  return data as T;
}

type RegOptions = { tempId: string; options: PublicKeyCredentialCreationOptionsJSON };
type AuthOptions = { tempId: string; options: PublicKeyCredentialRequestOptionsJSON };

/** 新規登録：パスキー作成 → セッション発行まで */
export async function registerPasskey(input: { email: string; haigo: string }): Promise<void> {
  const { tempId, options } = await postJson<RegOptions>("/api/auth/register/options", input);
  const response = await startRegistration({ optionsJSON: options });
  await postJson("/api/auth/register/verify", { tempId, response });
}

/** ログイン：パスキー認証 → セッション発行まで */
export async function loginPasskey(input: { email?: string }): Promise<void> {
  const { tempId, options } = await postJson<AuthOptions>("/api/auth/login/options", input);
  const response = await startAuthentication({ optionsJSON: options });
  await postJson("/api/auth/login/verify", { tempId, response });
}

/** ログイン済みユーザーが端末のパスキーを追加 */
export async function addPasskey(input: { deviceName?: string }): Promise<void> {
  const { tempId, options } = await postJson<RegOptions>("/api/auth/credentials/options", input);
  const response = await startRegistration({ optionsJSON: options });
  await postJson("/api/auth/credentials/verify", { tempId, response });
}
