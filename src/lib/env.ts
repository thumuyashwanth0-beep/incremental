import { z } from "zod";

const bool = z
  .enum(["true", "false"])
  .default("false")
  .transform((v) => v === "true");

const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().url(),
  APP_URL: z.string().url().default("http://localhost:3000"),
  ANTHROPIC_API_KEY: z.string().optional(),
  AI_ENABLED: bool,
  AI_MODEL: z.string().min(1).default("claude-opus-5"),
  AI_DAILY_LIMIT: z.coerce.number().int().min(0).default(30),
  PUBLISH_AUTO_VERIFIED: bool,
  ALLOW_SOURCES: z
    .string()
    .default("original,ai_generated,jeebench,pw25")
    .transform((s) => s.split(",").map((x) => x.trim()).filter(Boolean)),
});

export type Env = z.infer<typeof EnvSchema>;

let cached: Env | undefined;

/** Validated server environment. Throws at first use if misconfigured. */
export function env(): Env {
  cached ??= EnvSchema.parse(process.env);
  return cached;
}
