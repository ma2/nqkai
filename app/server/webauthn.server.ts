import type {
  AuthenticationResponseJSON,
  AuthenticatorTransportFuture,
  RegistrationResponseJSON,
} from "@simplewebauthn/server";
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from "@simplewebauthn/server";
import { isoBase64URL } from "@simplewebauthn/server/helpers";
import { WEBAUTHN_CHALLENGE_TTL_SECONDS } from "~/lib/constants";
import { newId } from "~/lib/id";

interface RpConfig {
  rpID: string;
  rpName: string;
  origin: string;
}

function rp(env: Env): RpConfig {
  return {
    rpID: env.WEBAUTHN_RP_ID,
    rpName: env.WEBAUTHN_RP_NAME,
    origin: env.WEBAUTHN_ORIGIN,
  };
}

export interface StoredCredential {
  id: string;
  publicKey: string; // base64url
  counter: number;
  transports: string | null; // JSON 配列文字列
}

function toAllowList(creds: StoredCredential[]) {
  return creds.map((c) => ({
    id: c.id,
    transports: (c.transports ? JSON.parse(c.transports) : undefined) as
      | AuthenticatorTransportFuture[]
      | undefined,
  }));
}

// ---- 登録 ----------------------------------------------------------------

interface PendingRegistration {
  challenge: string;
  email: string;
  haigo: string;
  userId: string;
  deviceName?: string;
  /** mode = "recover" のとき、検証済みの復旧コード行 ID を束縛する */
  codeId?: string;
}

type StartRegistrationArgs =
  | { mode: "new"; email: string; haigo: string }
  | {
      mode: "add";
      userId: string;
      email: string;
      haigo: string;
      existing: StoredCredential[];
      deviceName?: string;
    }
  | {
      mode: "recover";
      userId: string;
      email: string;
      haigo: string;
      existing: StoredCredential[];
      codeId: string;
    };

export async function startRegistration(env: Env, args: StartRegistrationArgs) {
  const { rpID, rpName } = rp(env);
  const userId = args.mode === "new" ? newId() : args.userId;

  const options = await generateRegistrationOptions({
    rpName,
    rpID,
    userName: args.email,
    userDisplayName: args.haigo,
    userID: new TextEncoder().encode(userId),
    attestationType: "none",
    excludeCredentials: args.mode === "new" ? [] : toAllowList(args.existing),
    authenticatorSelection: {
      residentKey: "preferred",
      userVerification: "preferred",
    },
  });

  const tempId = newId();
  const pending: PendingRegistration = {
    challenge: options.challenge,
    email: args.email,
    haigo: args.haigo,
    userId,
    deviceName: args.mode === "add" ? args.deviceName : undefined,
    codeId: args.mode === "recover" ? args.codeId : undefined,
  };
  await env.KV.put(`reg:${tempId}`, JSON.stringify(pending), {
    expirationTtl: WEBAUTHN_CHALLENGE_TTL_SECONDS,
  });

  return { tempId, options };
}

export async function finishRegistration(
  env: Env,
  tempId: string,
  response: RegistrationResponseJSON,
) {
  const raw = await env.KV.get(`reg:${tempId}`);
  if (!raw) throw new Response("登録セッションが無効です。やり直してください", { status: 400 });
  await env.KV.delete(`reg:${tempId}`);
  const pending = JSON.parse(raw) as PendingRegistration;

  const { rpID, origin } = rp(env);
  const verification = await verifyRegistrationResponse({
    response,
    expectedChallenge: pending.challenge,
    expectedOrigin: origin,
    expectedRPID: rpID,
    requireUserVerification: false,
  });
  if (!verification.verified || !verification.registrationInfo) {
    throw new Response("パスキーの登録に失敗しました", { status: 400 });
  }

  const cred = verification.registrationInfo.credential;
  return {
    pending,
    credential: {
      id: cred.id,
      publicKey: isoBase64URL.fromBuffer(cred.publicKey),
      counter: cred.counter,
      transports: cred.transports ? JSON.stringify(cred.transports) : null,
    },
  };
}

// ---- 認証 ----------------------------------------------------------------

export async function startAuthentication(env: Env, allow: StoredCredential[]) {
  const { rpID } = rp(env);
  const options = await generateAuthenticationOptions({
    rpID,
    allowCredentials: toAllowList(allow),
    userVerification: "preferred",
  });

  const tempId = newId();
  await env.KV.put(`auth:${tempId}`, JSON.stringify({ challenge: options.challenge }), {
    expirationTtl: WEBAUTHN_CHALLENGE_TTL_SECONDS,
  });

  return { tempId, options };
}

export async function finishAuthentication(
  env: Env,
  tempId: string,
  response: AuthenticationResponseJSON,
  credential: StoredCredential,
) {
  const raw = await env.KV.get(`auth:${tempId}`);
  if (!raw) throw new Response("認証セッションが無効です。やり直してください", { status: 400 });
  await env.KV.delete(`auth:${tempId}`);
  const { challenge } = JSON.parse(raw) as { challenge: string };

  const { rpID, origin } = rp(env);
  const verification = await verifyAuthenticationResponse({
    response,
    expectedChallenge: challenge,
    expectedOrigin: origin,
    expectedRPID: rpID,
    requireUserVerification: false,
    credential: {
      id: credential.id,
      publicKey: isoBase64URL.toBuffer(credential.publicKey),
      counter: credential.counter,
      transports: credential.transports
        ? (JSON.parse(credential.transports) as AuthenticatorTransportFuture[])
        : undefined,
    },
  });

  return verification;
}
