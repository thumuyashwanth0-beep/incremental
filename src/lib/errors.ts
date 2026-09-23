/** Typed errors mapped to HTTP statuses by handler() in src/lib/http.ts. */
export class AppError extends Error {
  constructor(
    public readonly code: string,
    public readonly status: number,
  ) {
    super(code);
  }
}
export const unauthorized = () => new AppError("unauthorized", 401);
export const forbidden = () => new AppError("forbidden", 403);
export const notFound = (what = "not_found") => new AppError(what, 404);
export const conflict = (code: string) => new AppError(code, 409);
export const badRequest = (code: string) => new AppError(code, 400);
export const tooMany = (code = "rate_limited") => new AppError(code, 429);
export const unavailable = (code: string) => new AppError(code, 503);
