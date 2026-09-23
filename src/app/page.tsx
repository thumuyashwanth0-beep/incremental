import Link from "next/link";
import { getCurrentUser } from "@/lib/auth/session";

const FEATURES = [
  ["Every wrong option explains itself", "Each distractor is linked to the misconception behind it, so you learn *why* you were tempted."],
  ["AI tutor reads your working", "Type your steps and the tutor finds the first wrong step, names the error type and tells you what to fix."],
  ["Knows your weak spots", "Topic mastery is tracked across all 54 NTA units, with weak topics ranked by how many marks they cost you."],
  ["Mistakes come back", "Missed questions return as similar questions a day, 3 days and a week later until the concept sticks."],
];

export default async function Home() {
  const user = await getCurrentUser();
  return (
    <div className="space-y-10 py-6">
      <section className="space-y-4">
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">JEE Main practice that tells you <span className="text-indigo-600">why</span> you got it wrong.</h1>
        <p className="max-w-2xl text-lg text-slate-600">
          MCQ and numerical questions across Physics, Chemistry and Maths, with instant diagnosis of your mistakes,
          adaptive practice and spaced revision.
        </p>
        <Link href={user ? "/practice" : "/signup"} className="inline-block rounded-lg bg-indigo-600 px-5 py-2.5 font-medium text-white hover:bg-indigo-700">
          {user ? "Continue practising" : "Start practising, free"}
        </Link>
      </section>
      <section className="grid gap-4 sm:grid-cols-2">
        {FEATURES.map(([title, body]) => (
          <div key={title} className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
            <h2 className="font-semibold">{title}</h2>
            <p className="mt-1 text-sm text-slate-600">{body.replace(/\*/g, "")}</p>
          </div>
        ))}
      </section>
    </div>
  );
}
