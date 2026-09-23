import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { getAnalytics } from "@/server/services/analytics";
import { StartSessionButton } from "@/components/StartSessionButton";
import { MasteryBar } from "@/components/MasteryBar";

const SIGNAL_TEXT: Record<string, string> = {
  misconception: "Confident but wrong (misconceptions)",
  careless: "Careless / rushed",
  knowledge_gap: "Didn't know it yet",
  error: "Other mistakes",
  skipped: "Skipped",
};

const pct = (v: number | null) => (v === null ? "–" : `${Math.round(v * 100)}%`);

export default async function DashboardPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/dashboard");
  const a = await getAnalytics(user.id);

  if (a.overall.attempts === 0)
    return (
      <div className="rounded-2xl bg-white p-8 text-center shadow-sm ring-1 ring-slate-200">
        <h1 className="text-xl font-semibold">Welcome, {user.name}!</h1>
        <p className="mt-2 text-slate-600">Answer a few questions and your mastery map and mistake analysis will appear here.</p>
        <div className="mt-5">
          <StartSessionButton body={{ mode: "adaptive" }}>Start adaptive practice</StartSessionButton>
        </div>
      </div>
    );

  return (
    <div className="space-y-6">
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          ["Questions answered", String(a.overall.attempts)],
          ["Accuracy", pct(a.overall.accuracy)],
          ["Last 7 days", String(a.overall.last7Days)],
          ["Reviews due", String(a.overall.reviewDue)],
        ].map(([k, v]) => (
          <div key={k} className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
            <div className="text-2xl font-semibold tabular-nums">{v}</div>
            <div className="text-xs text-slate-500">{k}</div>
          </div>
        ))}
      </section>

      {a.overall.reviewDue > 0 && (
        <div className="flex items-center justify-between rounded-2xl bg-violet-50 p-4 ring-1 ring-violet-200">
          <span className="text-sm">You have {a.overall.reviewDue} mistake(s) ready for a re-test.</span>
          <StartSessionButton body={{ mode: "review" }} className="rounded-lg bg-violet-600 px-3 py-1.5 text-sm text-white">
            Review now
          </StartSessionButton>
        </div>
      )}

      <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
        <h2 className="font-semibold">Fix these for the most marks</h2>
        <p className="text-xs text-slate-500">Ranked by exam weight × how much you still have to gain.</p>
        {a.weakTopics.length ? (
          <ul className="mt-3 divide-y divide-slate-100">
            {a.weakTopics.map((w) => (
              <li key={w.topicId} className="flex items-center gap-3 py-2 text-sm">
                <span className="flex-1">{w.name}</span>
                <MasteryBar value={w.mastery} attempts={w.attempts} />
                <StartSessionButton body={{ mode: "topic", topicId: w.topicId }} className="rounded-md px-2 py-1 text-xs ring-1 ring-slate-300">
                  Practise
                </StartSessionButton>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-sm text-slate-500">No weak topics yet. Keep practising (we need at least 3 attempts per topic).</p>
        )}
      </section>

      <div className="grid gap-6 sm:grid-cols-2">
        <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
          <h2 className="font-semibold">Where your mistakes come from</h2>
          {a.signals.length ? (
            <ul className="mt-3 space-y-2 text-sm">
              {a.signals.map((s) => (
                <li key={s.signal} className="flex items-center gap-2">
                  <span className="flex-1">{SIGNAL_TEXT[s.signal] ?? s.signal}</span>
                  <span className="tabular-nums text-slate-600">{Math.round(s.share * 100)}%</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-sm text-slate-500">No mistakes yet!</p>
          )}
          {a.aiErrorTypes.length > 0 && (
            <>
              <h3 className="mt-4 text-sm font-medium">From AI analysis of your working</h3>
              <ul className="mt-1 space-y-1 text-sm text-slate-600">
                {a.aiErrorTypes.map((e) => (
                  <li key={e.type}>
                    {e.type}: {e.count}
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>

        <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
          <h2 className="font-semibold">Recurring misconceptions (14 days)</h2>
          {a.misconceptions.length ? (
            <ul className="mt-3 space-y-3 text-sm">
              {a.misconceptions.map((m) => (
                <li key={m.misconceptionId}>
                  <p className="font-medium">
                    {m.description} <span className="text-slate-400">×{m.count}</span>
                  </p>
                  <p className="text-slate-600">{m.remediation}</p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-sm text-slate-500">None repeating. 👍</p>
          )}
        </section>
      </div>

      <section className="space-y-3">
        <h2 className="font-semibold">Mastery by subject</h2>
        {a.subjects.map((s) => (
          <details key={s.id} className="rounded-xl bg-white shadow-sm ring-1 ring-slate-200">
            <summary className="flex cursor-pointer items-center gap-3 px-4 py-3">
              <span className="flex-1 font-medium">{s.name}</span>
              <MasteryBar value={s.mastery} attempts={s.units.reduce((n, u) => n + u.topics.reduce((m, t) => m + t.attempts, 0), 0)} />
            </summary>
            <ul className="divide-y divide-slate-100 border-t border-slate-100">
              {s.units
                .filter((u) => u.topics.some((t) => t.attempts > 0))
                .map((u) => (
                  <li key={u.id} className="flex items-center gap-3 px-4 py-2 text-sm">
                    <span className="flex-1">{u.name}</span>
                    <MasteryBar value={u.mastery} attempts={u.topics.reduce((m, t) => m + t.attempts, 0)} />
                  </li>
                ))}
            </ul>
          </details>
        ))}
        <p className="text-xs text-slate-400">
          Mastery appears after 5 attempts. <Link href="/practice" className="underline">Browse all topics</Link>
        </p>
      </section>
    </div>
  );
}
