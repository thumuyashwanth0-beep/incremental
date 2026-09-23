"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api, errorText } from "@/lib/client-api";

type Body = { mode: "topic"; topicId: string } | { mode: "adaptive"; subjectId?: "phy" | "chem" | "math" } | { mode: "review" };

export function StartSessionButton({ body, children, className }: { body: Body; children: React.ReactNode; className?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <span className="inline-flex flex-col">
      <button
        disabled={busy}
        className={className ?? "rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"}
        onClick={async () => {
          setBusy(true);
          try {
            const { session } = await api<{ session: { id: string } }>("/api/practice/sessions", { body });
            router.push(`/practice/${session.id}`);
          } catch (e) {
            setError(errorText(e));
            setBusy(false);
          }
        }}
      >
        {children}
      </button>
      {error && <span className="mt-1 text-xs text-rose-600">{error}</span>}
    </span>
  );
}
