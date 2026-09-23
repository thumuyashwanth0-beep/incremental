import type { Metadata } from "next";
import Link from "next/link";
import "katex/dist/katex.min.css";
import "./globals.css";
import { getCurrentUser } from "@/lib/auth/session";
import { LogoutButton } from "@/components/LogoutButton";

export const metadata: Metadata = {
  title: "JEE Prep Coach",
  description: "JEE Main practice that explains why you went wrong and what to fix next.",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const user = await getCurrentUser();
  return (
    <html lang="en" className="h-full antialiased">
      <body className="flex min-h-full flex-col bg-slate-50 text-slate-900">
        <header className="border-b border-slate-200 bg-white">
          <nav className="mx-auto flex max-w-4xl items-center gap-5 px-4 py-3">
            <Link href="/" className="font-semibold text-indigo-700">JEE Prep Coach</Link>
            {user && (
              <>
                <Link href="/practice" className="text-sm text-slate-600 hover:text-slate-900">Practice</Link>
                <Link href="/dashboard" className="text-sm text-slate-600 hover:text-slate-900">Dashboard</Link>
              </>
            )}
            <span className="ml-auto flex items-center gap-4">
              {user ? (
                <>
                  <span className="hidden text-sm text-slate-500 sm:inline">{user.name}</span>
                  <LogoutButton />
                </>
              ) : (
                <>
                  <Link href="/login" className="text-sm text-slate-600">Log in</Link>
                  <Link href="/signup" className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm text-white">Sign up</Link>
                </>
              )}
            </span>
          </nav>
        </header>
        <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-6">{children}</main>
      </body>
    </html>
  );
}
