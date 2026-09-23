import Anthropic from "@anthropic-ai/sdk";

let client: Anthropic | undefined;

/** Shared Anthropic client. Credentials come from the environment (ANTHROPIC_API_KEY etc.). */
export function anthropic(): Anthropic {
  client ??= new Anthropic({ maxRetries: 2, timeout: 90_000 });
  return client;
}

/**
 * Request fields shared by every call: server-side refusal fallbacks ("default" routes by refusal
 * category) so a rare classifier false-positive on e.g. a chemistry question doesn't fail the request.
 */
export const FALLBACK_BETA = "server-side-fallback-2026-07-01" as const;
