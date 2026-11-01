/** Domain error with a stable i18n key; safe to show to the user. */
export class AppError extends Error {
  constructor(
    public readonly code: string,
    public readonly params: Record<string, string | number> = {},
  ) {
    super(code);
    this.name = "AppError";
  }
}

export type ActionResult<T = undefined> =
  | { ok: true; data: T }
  | { ok: false; error: string; params?: Record<string, string | number>; fieldErrors?: Record<string, string> };

export function fail(code: string, params?: Record<string, string | number>): { ok: false; error: string; params?: Record<string, string | number> } {
  return { ok: false, error: code, params };
}

export function toActionError(e: unknown): { ok: false; error: string; params?: Record<string, string | number> } {
  if (e instanceof AppError) return { ok: false, error: e.code, params: e.params };
  console.error("[sellnow] unexpected error", e);
  return { ok: false, error: "errors.unexpected" };
}
