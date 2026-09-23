import "server-only";
import { ZodError } from "zod";
import { AppError } from "./errors";

export function json(data: unknown, status = 200): Response {
  return Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
}

type RouteCtx<P> = { params: Promise<P> };

/** Wraps a route handler: maps known errors to status codes and hides internals. */
export function handler<P = Record<string, string>>(fn: (req: Request, ctx: RouteCtx<P>) => Promise<Response>) {
  return async (req: Request, ctx: RouteCtx<P>): Promise<Response> => {
    try {
      return await fn(req, ctx);
    } catch (err) {
      if (err instanceof ZodError) {
        return json({ error: "invalid_request", issues: err.issues.map((i) => ({ path: i.path, message: i.message })) }, 400);
      }
      if (err instanceof AppError) return json({ error: err.code }, err.status);
      if (err instanceof SyntaxError) return json({ error: "invalid_json" }, 400);
      console.error("[api] unhandled", err);
      return json({ error: "internal_error" }, 500);
    }
  };
}

/** Parses a JSON body with a byte cap (default 64 KB). */
export async function readJson(req: Request, maxBytes = 64 * 1024): Promise<unknown> {
  const text = await req.text();
  if (text.length > maxBytes) throw new AppError("payload_too_large", 413);
  return JSON.parse(text);
}
