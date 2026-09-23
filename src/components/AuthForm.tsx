"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { api, errorText } from "@/lib/client-api";

export function AuthForm({ mode }: { mode: "login" | "signup" }) {
  const router = useRouter();
  const next = useSearchParams().get("next");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const body = Object.fromEntries(["email", "password", ...(mode === "signup" ? ["name"] : [])].map((k) => [k, String(f.get(k) ?? "")]));
    setBusy(true);
    setError(null);
    try {
      await api(`/api/auth/${mode}`, { body });
      // Only allow same-site relative redirects.
      router.push(next && next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard");
      router.refresh();
    } catch (err) {
      setError(errorText(err));
      setBusy(false);
    }
  }

  const input = "w-full rounded-lg border border-slate-300 px-3 py-2 focus:border-indigo-500 focus:outline-none";
  return (
    <form onSubmit={onSubmit} className="mx-auto mt-12 w-full max-w-sm space-y-4 rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
      <h1 className="text-xl font-semibold">{mode === "login" ? "Welcome back" : "Create your account"}</h1>
      {mode === "signup" && <input name="name" placeholder="Your name" required maxLength={80} className={input} autoComplete="name" />}
      <input name="email" type="email" placeholder="Email" required className={input} autoComplete="email" />
      <input
        name="password"
        type="password"
        placeholder={mode === "signup" ? "Password (min 8 characters)" : "Password"}
        required
        minLength={mode === "signup" ? 8 : undefined}
        className={input}
        autoComplete={mode === "signup" ? "new-password" : "current-password"}
      />
      {error && <p className="text-sm text-rose-600">{error}</p>}
      <button disabled={busy} className="w-full rounded-lg bg-indigo-600 py-2 font-medium text-white hover:bg-indigo-700 disabled:opacity-50">
        {busy ? "Please wait…" : mode === "login" ? "Log in" : "Sign up"}
      </button>
      <p className="text-center text-sm text-slate-500">
        {mode === "login" ? (
          <>New here? <Link className="text-indigo-600" href="/signup">Create an account</Link></>
        ) : (
          <>Have an account? <Link className="text-indigo-600" href="/login">Log in</Link></>
        )}
      </p>
    </form>
  );
}
