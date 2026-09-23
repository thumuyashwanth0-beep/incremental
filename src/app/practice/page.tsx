import { redirect } from "next/navigation";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { questions, topicMastery } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/session";
import { masteryScore, MIN_ATTEMPTS_FOR_DISPLAY } from "@/lib/engine/mastery";
import { syllabus } from "@/lib/syllabus";
import { servableFilter } from "@/server/services/questions";
import { reviewStatus } from "@/server/services/analytics";
import { StartSessionButton } from "@/components/StartSessionButton";
import { MasteryBar } from "@/components/MasteryBar";

export default async function PracticePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/practice");

  const [counts, mastery, review] = await Promise.all([
    db.select({ topicId: questions.topicId, n: sql<number>`count(*)::int` }).from(questions).where(servableFilter()).groupBy(questions.topicId),
    db.select().from(topicMastery).where(eq(topicMastery.userId, user.id)),
    reviewStatus(user.id),
  ]);
  const countBy = new Map(counts.map((c) => [c.topicId, c.n]));
  const masteryBy = new Map(mastery.map((m) => [m.topicId, m]));

  return (
    <div className="space-y-6">
      <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
        <h1 className="text-xl font-semibold">Practice</h1>
        <p className="mt-1 text-sm text-slate-600">Adaptive practice picks your weakest high-weight topics at the right difficulty.</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <StartSessionButton body={{ mode: "adaptive" }}>Adaptive: all subjects</StartSessionButton>
          {syllabus.subjects.map((s) => (
            <StartSessionButton
              key={s.id}
              body={{ mode: "adaptive", subjectId: s.id }}
              className="rounded-lg px-3 py-1.5 text-sm ring-1 ring-indigo-300 hover:bg-indigo-50"
            >
              {s.name}
            </StartSessionButton>
          ))}
          {review.dueCount > 0 && (
            <StartSessionButton body={{ mode: "review" }} className="rounded-lg bg-violet-600 px-3 py-1.5 text-sm text-white">
              Review mistakes ({review.dueCount} due)
            </StartSessionButton>
          )}
        </div>
      </section>

      {syllabus.subjects.map((s) => (
        <section key={s.id} className="space-y-2">
          <h2 className="text-lg font-semibold">{s.name}</h2>
          {s.units.map((u) => {
            const available = u.topics.reduce((a, t) => a + (countBy.get(t.id) ?? 0), 0);
            return (
              <details key={u.id} className="rounded-xl bg-white shadow-sm ring-1 ring-slate-200">
                <summary className="flex cursor-pointer items-center gap-3 px-4 py-3">
                  <span className="flex-1 font-medium">{u.name}</span>
                  <span className="text-xs text-slate-400">Class {u.class} · {available} q</span>
                </summary>
                <ul className="divide-y divide-slate-100 border-t border-slate-100">
                  {u.topics.map((t) => {
                    const n = countBy.get(t.id) ?? 0;
                    const m = masteryBy.get(t.id);
                    const score = m && m.attempts >= MIN_ATTEMPTS_FOR_DISPLAY ? masteryScore(m.theta) : null;
                    return (
                      <li key={t.id} className="flex items-center gap-3 px-4 py-2 text-sm">
                        <span className="flex-1">{t.name}</span>
                        <MasteryBar value={score} attempts={m?.attempts ?? 0} />
                        {n > 0 ? (
                          <StartSessionButton body={{ mode: "topic", topicId: t.id }} className="rounded-md px-2 py-1 text-xs ring-1 ring-slate-300 hover:bg-slate-50">
                            Practise ({n})
                          </StartSessionButton>
                        ) : (
                          <span className="w-24 text-right text-xs text-slate-400">coming soon</span>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </details>
            );
          })}
        </section>
      ))}
    </div>
  );
}
