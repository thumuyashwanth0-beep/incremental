export function MasteryBar({ value, attempts }: { value: number | null; attempts: number }) {
  if (value === null)
    return <span className="w-28 text-right text-xs text-slate-400">{attempts ? `${attempts} tried` : "not started"}</span>;
  const pct = Math.round(value * 100);
  const color = pct >= 70 ? "bg-emerald-500" : pct >= 40 ? "bg-amber-500" : "bg-rose-500";
  return (
    <span className="flex w-28 items-center gap-2" title={`${pct}% mastery from ${attempts} attempts`}>
      <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-200">
        <span className={`block h-full ${color}`} style={{ width: `${pct}%` }} />
      </span>
      <span className="w-8 text-right text-xs tabular-nums text-slate-600">{pct}%</span>
    </span>
  );
}
