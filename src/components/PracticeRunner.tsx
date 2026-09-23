"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { api, errorText } from "@/lib/client-api";
import type { PublicQuestion } from "@/server/services/questions";
import type { AttemptResult } from "@/server/services/attempts";
import type { WorkingAnalysis } from "@/lib/ai/schemas";
import { RichHtml } from "./RichHtml";

type Next =
  | { done: false; question: PublicQuestion; position: number; total: number; isReview: boolean }
  | { done: true; total: number };
type Confidence = "sure" | "unsure" | "guess";

const SIGNAL_LABEL: Record<string, { text: string; tone: string }> = {
  solid: { text: "Solid", tone: "bg-emerald-100 text-emerald-800" },
  inefficient: { text: "Correct but slow", tone: "bg-amber-100 text-amber-800" },
  fragile: { text: "Correct but shaky", tone: "bg-amber-100 text-amber-800" },
  misconception: { text: "Misconception", tone: "bg-rose-100 text-rose-800" },
  careless: { text: "Likely careless slip", tone: "bg-orange-100 text-orange-800" },
  knowledge_gap: { text: "Knowledge gap", tone: "bg-sky-100 text-sky-800" },
  error: { text: "Incorrect", tone: "bg-rose-100 text-rose-800" },
  skipped: { text: "Skipped", tone: "bg-slate-100 text-slate-700" },
};

const ERROR_TYPE_LABEL: Record<string, string> = {
  conceptual: "Conceptual error",
  formula: "Wrong or misremembered formula",
  calculation: "Calculation slip",
  sign: "Sign error",
  units: "Units / conversion error",
  misread: "Misread the question",
  incomplete: "Incomplete solution",
  other: "Other",
  none: "No error found in your method",
};

export function PracticeRunner({ sessionId }: { sessionId: string }) {
  const [next, setNext] = useState<Next | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [numeric, setNumeric] = useState("");
  const [confidence, setConfidence] = useState<Confidence | null>(null);
  const [working, setWorking] = useState("");
  const [hints, setHints] = useState<string[]>([]);
  const [result, setResult] = useState<AttemptResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const startedAt = useRef<number>(0);

  const load = useCallback(async () => {
    setError(null);
    try {
      const n = await api<Next>(`/api/practice/sessions/${sessionId}/next`);
      setNext(n);
      setSelected(null);
      setNumeric("");
      setConfidence(null);
      setWorking("");
      setHints([]);
      setResult(null);
      startedAt.current = Date.now();
      setElapsed(0);
    } catch (e) {
      setError(errorText(e));
    }
  }, [sessionId]);

  useEffect(() => {
    // Initial fetch of the first question: an external-system sync, so setState happens in load().
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  useEffect(() => {
    if (!next || next.done || result) return;
    const t = setInterval(() => setElapsed(Math.floor((Date.now() - startedAt.current) / 1000)), 1000);
    return () => clearInterval(t);
  }, [next, result]);

  if (error) return <p className="text-rose-600">{error}</p>;
  if (!next) return <p className="text-slate-500">Loading…</p>;
  if (next.done)
    return (
      <div className="rounded-2xl bg-white p-8 text-center shadow-sm ring-1 ring-slate-200">
        <h2 className="text-xl font-semibold">Session complete 🎉</h2>
        <p className="mt-2 text-slate-600">You answered {next.total} question(s). Your dashboard has been updated.</p>
        <div className="mt-6 flex justify-center gap-3">
          <Link href="/dashboard" className="rounded-lg bg-indigo-600 px-4 py-2 text-white">See dashboard</Link>
          <Link href="/practice" className="rounded-lg px-4 py-2 ring-1 ring-slate-300">Practise more</Link>
        </div>
      </div>
    );

  const q = next.question;

  async function submit(skip = false) {
    const response = skip
      ? { kind: "skip" as const }
      : q.type === "numerical"
        ? { kind: "numeric" as const, value: Number(numeric) }
        : { kind: "choice" as const, keys: [selected as "A" | "B" | "C" | "D"] };
    setBusy(true);
    try {
      const r = await api<AttemptResult>("/api/attempts", {
        body: {
          sessionId,
          questionId: q.id,
          response,
          timeTakenMs: Date.now() - startedAt.current,
          confidence: skip ? undefined : (confidence ?? undefined),
          hintsUsed: hints.length,
          working: working.trim() || undefined,
        },
      });
      setResult(r);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  async function showHint() {
    try {
      const h = await api<{ html: string }>(`/api/practice/sessions/${sessionId}/hint`, { body: { n: hints.length + 1 } });
      setHints((prev) => [...prev, h.html]);
    } catch (e) {
      setError(errorText(e));
    }
  }

  const canSubmit = q.type === "numerical" ? numeric.trim() !== "" && Number.isFinite(Number(numeric)) : selected !== null;
  const mm = String(Math.floor(elapsed / 60)).padStart(2, "0");
  const ss = String(elapsed % 60).padStart(2, "0");

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between text-sm text-slate-500">
        <span>
          Question {next.position} of {next.total}
          {next.isReview && <span className="ml-2 rounded bg-violet-100 px-2 py-0.5 text-violet-700">Review</span>}
        </span>
        <span className="font-mono">
          {mm}:{ss} <span className="text-slate-400">/ ~{Math.round(q.expectedTimeSec / 60)} min</span>
        </span>
      </div>

      <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
        <RichHtml html={q.stemHtml} className="text-[1.05rem] leading-relaxed" />

        {q.type === "numerical" ? (
          <input
            inputMode="decimal"
            value={numeric}
            disabled={!!result}
            onChange={(e) => setNumeric(e.target.value)}
            placeholder="Enter a numerical answer"
            className="mt-4 w-full max-w-xs rounded-lg border border-slate-300 px-3 py-2 font-mono"
          />
        ) : (
          <div className="mt-4 grid gap-2">
            {q.options.map((o) => {
              const fb = result?.optionFeedback.find((f) => f.key === o.key);
              const picked = selected === o.key;
              const tone = result
                ? fb?.correct
                  ? "ring-2 ring-emerald-500 bg-emerald-50"
                  : picked
                    ? "ring-2 ring-rose-500 bg-rose-50"
                    : "ring-1 ring-slate-200 opacity-80"
                : picked
                  ? "ring-2 ring-indigo-500 bg-indigo-50"
                  : "ring-1 ring-slate-200 hover:bg-slate-50";
              return (
                <button
                  key={o.key}
                  disabled={!!result}
                  onClick={() => setSelected(o.key)}
                  className={`flex items-start gap-3 rounded-xl p-3 text-left transition ${tone}`}
                >
                  <span className="mt-0.5 font-semibold text-slate-500">{o.key}</span>
                  <span className="flex-1">
                    <RichHtml as="span" html={o.html} />
                    {result && !fb?.correct && (fb?.whyWrongHtml || fb?.misconception) && (
                      <span className="mt-1 block text-sm text-slate-600">
                        {fb?.misconception && <span className="font-medium">{fb.misconception} </span>}
                        {fb?.whyWrongHtml && <RichHtml as="span" html={fb.whyWrongHtml} className="inline" />}
                      </span>
                    )}
                  </span>
                </button>
              );
            })}
          </div>
        )}

        {hints.length > 0 && (
          <div className="mt-4 space-y-2">
            {hints.map((h, i) => (
              <div key={i} className="rounded-lg bg-amber-50 p-3 text-sm ring-1 ring-amber-200">
                <span className="font-medium">Hint {i + 1}: </span>
                <RichHtml html={h} className="inline" />
              </div>
            ))}
          </div>
        )}
      </div>

      {!result ? (
        <div className="space-y-4 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
          <div>
            <p className="mb-2 text-sm font-medium text-slate-700">How sure are you?</p>
            <div className="flex gap-2">
              {(["sure", "unsure", "guess"] as const).map((c) => (
                <button
                  key={c}
                  onClick={() => setConfidence(c)}
                  className={`rounded-full px-3 py-1 text-sm capitalize ring-1 ${confidence === c ? "bg-indigo-600 text-white ring-indigo-600" : "ring-slate-300"}`}
                >
                  {c === "guess" ? "Guessing" : c}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700" htmlFor="working">
              Your working <span className="font-normal text-slate-400">(optional; lets the AI tutor find where you went wrong)</span>
            </label>
            <textarea
              id="working"
              value={working}
              onChange={(e) => setWorking(e.target.value)}
              maxLength={4000}
              rows={3}
              placeholder="e.g. u_y = 20 sin30 = 10, H = u_y^2 / 2g = …"
              className="w-full rounded-lg border border-slate-300 p-2 font-mono text-sm"
            />
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button
              disabled={!canSubmit || busy}
              onClick={() => submit()}
              className="rounded-lg bg-indigo-600 px-5 py-2 font-medium text-white hover:bg-indigo-700 disabled:opacity-40"
            >
              Submit
            </button>
            {hints.length < q.hintsAvailable && (
              <button onClick={showHint} className="rounded-lg px-3 py-2 text-sm ring-1 ring-amber-300 hover:bg-amber-50">
                Show hint ({hints.length + 1}/{q.hintsAvailable})
              </button>
            )}
            <button disabled={busy} onClick={() => submit(true)} className="ml-auto text-sm text-slate-500 hover:text-slate-800">
              Skip
            </button>
          </div>
        </div>
      ) : (
        <ResultPanel result={result} working={working} onNext={load} questionId={q.id} />
      )}
    </div>
  );
}

function ResultPanel({ result, working, onNext, questionId }: { result: AttemptResult; working: string; onNext: () => void; questionId: string }) {
  const d = result.diagnosis;
  const label = SIGNAL_LABEL[d.signal];
  const delta = Math.round((result.mastery.after - result.mastery.before) * 100);
  return (
    <div className="space-y-4">
      <div className={`rounded-2xl p-5 ring-1 ${result.correct ? "bg-emerald-50 ring-emerald-200" : "bg-rose-50 ring-rose-200"}`}>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-lg font-semibold">{result.correct ? "Correct ✓" : d.outcome === "skipped" ? "Skipped" : "Not quite ✗"}</span>
          <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${label.tone}`}>{label.text}</span>
          {d.timeFlag !== "normal" && (
            <span className="rounded-full bg-white px-2 py-0.5 text-xs text-slate-600 ring-1 ring-slate-200">
              {d.timeFlag === "rushed" ? "Very fast" : "Slow"} ({d.timeRatio}× expected time)
            </span>
          )}
          <span className="ml-auto text-sm text-slate-600">
            Topic mastery {delta >= 0 ? "+" : ""}
            {delta}%
          </span>
        </div>
        {!result.correct && result.answer.kind === "numeric" && (
          <p className="mt-2 text-sm">Correct answer: <span className="font-mono font-semibold">{result.answer.value}</span></p>
        )}
        <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-slate-700">
          {d.tips.map((t, i) => (
            <li key={i}>{t}</li>
          ))}
        </ul>
      </div>

      <details open={!result.correct} className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
        <summary className="cursor-pointer font-medium">Worked solution</summary>
        <RichHtml html={result.solutionHtml} className="mt-3 leading-relaxed" />
      </details>

      <AiAnalysis attemptId={result.attemptId} initialWorking={working} />

      <div className="flex items-center gap-3">
        <button onClick={onNext} className="rounded-lg bg-indigo-600 px-5 py-2 font-medium text-white hover:bg-indigo-700">
          Next question →
        </button>
        <ReportButton questionId={questionId} />
      </div>
    </div>
  );
}

function AiAnalysis({ attemptId, initialWorking }: { attemptId: string; initialWorking: string }) {
  const [working, setWorking] = useState(initialWorking);
  const [analysis, setAnalysis] = useState<WorkingAnalysis | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setError(null);
    try {
      const r = await api<{ analysis: WorkingAnalysis }>(`/api/attempts/${attemptId}/analyze`, { body: { working: working.trim() || undefined } });
      setAnalysis(r.analysis);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
      <p className="font-medium">🧠 AI tutor: find where your method went wrong</p>
      {!analysis && (
        <>
          <textarea
            value={working}
            onChange={(e) => setWorking(e.target.value)}
            rows={3}
            maxLength={4000}
            placeholder="Type the steps you used (optional but much more useful)"
            className="mt-2 w-full rounded-lg border border-slate-300 p-2 font-mono text-sm"
          />
          <button disabled={busy} onClick={run} className="mt-2 rounded-lg px-4 py-2 text-sm ring-1 ring-indigo-300 hover:bg-indigo-50 disabled:opacity-50">
            {busy ? "Analysing…" : "Analyse my attempt"}
          </button>
        </>
      )}
      {error && <p className="mt-2 text-sm text-rose-600">{error}</p>}
      {analysis && (
        // AI output is untrusted: rendered as plain text only (React escapes it).
        <div className="mt-3 space-y-2 text-sm">
          <p>
            <span className="rounded bg-slate-100 px-2 py-0.5 font-medium">{ERROR_TYPE_LABEL[analysis.errorType]}</span>
          </p>
          {analysis.firstWrongStep && (
            <p>
              <span className="font-medium">Where it went wrong:</span> <span className="font-mono">{analysis.firstWrongStep}</span>
            </p>
          )}
          <p>{analysis.explanation}</p>
          {analysis.improvementTips.length > 0 && (
            <ul className="list-disc pl-5">
              {analysis.improvementTips.map((t, i) => (
                <li key={i}>{t}</li>
              ))}
            </ul>
          )}
          {analysis.revisitTopicIds.length > 0 && <p className="text-slate-600">Revisit: {analysis.revisitTopicIds.join(", ")}</p>}
        </div>
      )}
    </div>
  );
}

function ReportButton({ questionId }: { questionId: string }) {
  const [state, setState] = useState<"idle" | "open" | "sent">("idle");
  const [reason, setReason] = useState("wrong_key");
  if (state === "sent") return <span className="text-sm text-slate-500">Thanks, we&apos;ll review it.</span>;
  if (state === "idle")
    return (
      <button onClick={() => setState("open")} className="text-sm text-slate-500 hover:text-slate-800">
        Report a problem
      </button>
    );
  return (
    <span className="flex items-center gap-2 text-sm">
      <select value={reason} onChange={(e) => setReason(e.target.value)} className="rounded border border-slate-300 px-2 py-1">
        <option value="wrong_key">Answer key is wrong</option>
        <option value="typo">Typo / formatting</option>
        <option value="unclear">Question is unclear</option>
        <option value="out_of_syllabus">Out of syllabus</option>
        <option value="other">Other</option>
      </select>
      <button
        className="rounded px-2 py-1 ring-1 ring-slate-300"
        onClick={async () => {
          await api(`/api/questions/${questionId}/report`, { body: { reason } }).catch(() => {});
          setState("sent");
        }}
      >
        Send
      </button>
    </span>
  );
}
