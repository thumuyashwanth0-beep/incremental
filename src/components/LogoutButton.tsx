"use client";

import { useRouter } from "next/navigation";
import { api } from "@/lib/client-api";

export function LogoutButton() {
  const router = useRouter();
  return (
    <button
      className="text-sm text-slate-500 hover:text-slate-900"
      onClick={async () => {
        await api("/api/auth/logout", { method: "POST" }).catch(() => {});
        router.push("/");
        router.refresh();
      }}
    >
      Log out
    </button>
  );
}
