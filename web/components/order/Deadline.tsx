import { deadlineState, formatDeadline, formatRemaining, nowSecs } from "@/lib/deadlines";

/** A deadline as a date, with the time left; `ember` when under 24 h (03 §3). */
export function Deadline({ at, children }: { at: bigint; children: (date: string) => string }) {
  const state = deadlineState(at, nowSecs());
  return (
    <p className={`text-body ${state.urgent ? "text-ember" : "text-bone"}`}>
      {children(formatDeadline(at))}
      {!state.expired ? <span className="text-steel"> (faltan {formatRemaining(state.remainingSecs)})</span> : null}
    </p>
  );
}
