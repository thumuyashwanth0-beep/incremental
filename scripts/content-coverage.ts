import { loadRawQuestions } from "../src/lib/content/load";
import { QuestionSchema } from "../src/lib/content/schema";
import { syllabus } from "../src/lib/syllabus";
import { bandOf, bandTargets, MIN_NUMERICAL_SHARE, MOCK_RESERVE_TARGET, topicTarget, TOPIC_MIN } from "../src/lib/syllabus/targets";

const asJson = process.argv.includes("--json");
const LIVE = new Set(["published", "auto_verified"]);

const qs = loadRawQuestions()
  .map((e) => QuestionSchema.safeParse(e.raw))
  .flatMap((r) => (r.success ? [r.data] : []));
const live = qs.filter((q) => LIVE.has(q.status));
const practice = live.filter((q) => !q.mockReserve);

type Row = { topicId: string; subject: string; unitWeight: number; target: number; have: number; easy: number; medium: number; hard: number; numerical: number; ready: boolean; missing: number };
const rows: Row[] = [];
for (const s of syllabus.subjects)
  for (const u of s.units)
    for (const t of u.topics) {
      const mine = practice.filter((q) => q.topicId === t.id);
      const bands = { easy: 0, medium: 0, hard: 0 };
      for (const q of mine) bands[bandOf(q.difficulty)]++;
      const target = topicTarget(u);
      const bt = bandTargets(TOPIC_MIN);
      const numerical = mine.filter((q) => q.type === "numerical").length;
      rows.push({
        topicId: t.id, subject: s.id, unitWeight: u.weight, target, have: mine.length, ...bands, numerical,
        ready: mine.length >= TOPIC_MIN && bands.easy >= bt.easy && bands.medium >= bt.medium && bands.hard >= bt.hard && numerical >= Math.ceil(TOPIC_MIN * MIN_NUMERICAL_SHARE),
        missing: Math.max(0, target - mine.length),
      });
    }

const totalTarget = rows.reduce((a, r) => a + r.target, 0);
const summary = {
  totalQuestions: qs.length,
  live: live.length,
  practiceLive: practice.length,
  practiceTarget: totalTarget,
  mockReserve: live.length - practice.length,
  mockReserveTarget: MOCK_RESERVE_TARGET,
  readyTopics: rows.filter((r) => r.ready).length,
  topics: rows.length,
  bySubject: Object.fromEntries(
    syllabus.subjects.map((s) => {
      const r = rows.filter((x) => x.subject === s.id);
      return [s.id, { have: r.reduce((a, x) => a + x.have, 0), target: r.reduce((a, x) => a + x.target, 0), ready: r.filter((x) => x.ready).length, topics: r.length }];
    }),
  ),
  byStatus: Object.fromEntries([...new Set(qs.map((q) => q.status))].map((st) => [st, qs.filter((q) => q.status === st).length])),
};
const gaps = [...rows].sort((a, b) => b.unitWeight * b.missing - a.unitWeight * a.missing).slice(0, 15);

if (asJson) {
  console.log(JSON.stringify({ summary, topics: rows }, null, 2));
} else {
  const pct = (a: number, b: number) => `${((100 * a) / b).toFixed(1)}%`;
  console.log(`Questions: ${summary.totalQuestions} total, ${summary.live} live (published + auto_verified)`);
  console.log(`Status: ${JSON.stringify(summary.byStatus)}`);
  console.log(`Practice pool: ${summary.practiceLive} / ${totalTarget} (${pct(summary.practiceLive, totalTarget)})`);
  console.log(`Mock reserve:  ${summary.mockReserve} / ${MOCK_RESERVE_TARGET}`);
  console.log(`Practice-ready topics: ${summary.readyTopics} / ${summary.topics}\n`);
  for (const [s, v] of Object.entries(summary.bySubject))
    console.log(`  ${s.padEnd(5)} ${String(v.have).padStart(5)} / ${v.target}  ready topics ${v.ready}/${v.topics}`);
  console.log(`\nTop gaps (unit weight × missing):`);
  for (const g of gaps)
    console.log(`  ${g.topicId.padEnd(52)} have ${String(g.have).padStart(3)}/${g.target}  E/M/H ${g.easy}/${g.medium}/${g.hard}  num ${g.numerical}`);
}
