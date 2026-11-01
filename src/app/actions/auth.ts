"use server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getDb } from "@/lib/db";
import { authenticate, createEmailVerification, createPasswordReset, createSession, destroySession, registerUser, registerSchema, resetPassword } from "@/lib/auth/service";
import { SESSION_COOKIE, WORKSPACE_COOKIE, setSessionCookie, requireUser } from "@/lib/auth/session";
import { rateLimit } from "@/lib/rate-limit";
import { clientIp, appUrl } from "@/lib/http";
import { AppError } from "@/lib/errors";
import { track } from "@/lib/audit";
import { sendEmail, emailConfigured } from "@/lib/email";
import { getLocale } from "@/lib/i18n/server";

export type AuthState = { error?: string; fields?: Record<string, string> } | undefined;

const DEV_VERIFY_COOKIE = "sn_dev_verify";

function safeNext(next: unknown) {
  const s = typeof next === "string" ? next : "";
  return s.startsWith("/") && !s.startsWith("//") ? s : "/dashboard";
}

async function issueVerification(userId: string, email: string) {
  const db = await getDb();
  const token = await createEmailVerification(db, userId);
  const link = `${await appUrl()}/verify-email?token=${token}`;
  await sendEmail({ to: email, subject: "SellNow — sahkan e-mel anda / verify your email", text: link });
  if (!emailConfigured() && process.env.NODE_ENV !== "production") {
    (await cookies()).set(DEV_VERIFY_COOKIE, link, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 3600 });
  }
}

export async function signupAction(_: AuthState, form: FormData): Promise<AuthState> {
  const ip = await clientIp();
  if (!rateLimit(`signup:${ip}`, 10, 60 * 60 * 1000).ok) return { error: "auth.rateLimited" };
  const raw = { name: String(form.get("name") ?? ""), email: String(form.get("email") ?? ""), password: String(form.get("password") ?? ""), locale: await getLocale() };
  const parsed = registerSchema.safeParse(raw);
  if (!parsed.success) return { error: "errors.validation", fields: { name: raw.name, email: raw.email } };
  const db = await getDb();
  try {
    await track(db, "signup_started");
    const user = await registerUser(db, parsed.data);
    const { token, expiresAt } = await createSession(db, user.id);
    await setSessionCookie(token, expiresAt);
    await issueVerification(user.id, user.email);
    await track(db, "signup_completed", { userId: user.id });
  } catch (e) {
    if (e instanceof AppError) return { error: e.code, fields: { name: raw.name, email: raw.email } };
    throw e;
  }
  redirect(safeNext(form.get("next")) === "/dashboard" ? "/onboarding" : safeNext(form.get("next")));
}

export async function loginAction(_: AuthState, form: FormData): Promise<AuthState> {
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const ip = await clientIp();
  if (!rateLimit(`login:${ip}:${email}`, 8, 15 * 60 * 1000).ok) return { error: "auth.rateLimited", fields: { email } };
  const db = await getDb();
  try {
    const user = await authenticate(db, email, String(form.get("password") ?? ""));
    const { token, expiresAt } = await createSession(db, user.id);
    await setSessionCookie(token, expiresAt);
  } catch (e) {
    if (e instanceof AppError) return { error: e.code, fields: { email } };
    throw e;
  }
  redirect(safeNext(form.get("next")));
}

export async function logoutAction() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await destroySession(await getDb(), token);
  jar.delete(SESSION_COOKIE);
  jar.delete(WORKSPACE_COOKIE);
  redirect("/");
}

export async function resendVerificationAction() {
  const user = await requireUser();
  if (user.emailVerifiedAt) return;
  if (!rateLimit(`verify:${user.id}`, 5, 60 * 60 * 1000).ok) return;
  await issueVerification(user.id, user.email);
}

export async function readDevVerifyLink() {
  if (process.env.NODE_ENV === "production") return null;
  return (await cookies()).get(DEV_VERIFY_COOKIE)?.value ?? null;
}

export type ResetState = { error?: string; sent?: boolean; done?: boolean } | undefined;

const DEV_RESET_COOKIE = "sn_dev_reset";

export async function requestResetAction(_: ResetState, form: FormData): Promise<ResetState> {
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const ip = await clientIp();
  if (!rateLimit(`reset:${ip}`, 5, 60 * 60 * 1000).ok || !rateLimit(`reset:${email}`, 3, 60 * 60 * 1000).ok) return { error: "auth.rateLimited" };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: "checkout.emailInvalid" };
  const db = await getDb();
  const r = await createPasswordReset(db, email);
  if (r) {
    const link = `${await appUrl()}/reset-password?token=${r.token}`;
    await sendEmail({ to: email, subject: "SellNow — reset your password / tetapkan semula kata laluan", text: link });
    if (!emailConfigured() && process.env.NODE_ENV !== "production") (await cookies()).set(DEV_RESET_COOKIE, link, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 900 });
  }
  // Same response whether or not the account exists.
  return { sent: true };
}

export async function resetPasswordAction(_: ResetState, form: FormData): Promise<ResetState> {
  const ip = await clientIp();
  if (!rateLimit(`resetdo:${ip}`, 10, 60 * 60 * 1000).ok) return { error: "auth.rateLimited" };
  try {
    await resetPassword(await getDb(), String(form.get("token") ?? ""), String(form.get("password") ?? ""));
    (await cookies()).delete(DEV_RESET_COOKIE);
    return { done: true };
  } catch (e) {
    if (e instanceof AppError) return { error: e.code };
    throw e;
  }
}

export async function readDevResetLink() {
  if (process.env.NODE_ENV === "production") return null;
  return (await cookies()).get(DEV_RESET_COOKIE)?.value ?? null;
}
