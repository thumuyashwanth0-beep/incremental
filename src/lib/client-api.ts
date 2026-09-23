"use client";

export class ApiError extends Error {
  constructor(
    public code: string,
    public status: number,
  ) {
    super(code);
  }
}

/** Browser-side JSON fetch against our own /api. Throws ApiError with the server's error code. */
export async function api<T>(path: string, init?: { method?: string; body?: unknown }): Promise<T> {
  const res = await fetch(path, {
    method: init?.method ?? (init?.body !== undefined ? "POST" : "GET"),
    headers: init?.body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
    credentials: "same-origin",
  });
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(data.error ?? "request_failed", res.status);
  return data as T;
}

export const ERROR_TEXT: Record<string, string> = {
  invalid_credentials: "Invalid email or password.",
  email_taken: "An account with this email already exists.",
  rate_limited: "Too many attempts. Please wait a few minutes.",
  ai_quota_exceeded: "You've used today's AI analyses. They reset tomorrow.",
  ai_disabled: "AI analysis isn't available right now.",
  ai_busy: "The AI tutor is busy. Try again in a minute.",
  ai_refused: "The AI couldn't analyse this attempt.",
  question_not_current: "This question was already answered (maybe in another tab).",
  invalid_request: "Please check the form and try again.",
};
export const errorText = (e: unknown) =>
  e instanceof ApiError ? (ERROR_TEXT[e.code] ?? `Something went wrong (${e.code}).`) : "Network error. Check your connection.";
