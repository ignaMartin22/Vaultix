import { deadlineState, formatDeadline, formatRemaining, nowSecs } from "@/lib/deadlines";

/** A deadline as a date, with the time left; `ember` with a mark when under 24 h (03 §3). */
export function Deadline({ at, children }: { at: bigint; children: (date: string) => string }) {
  const state = deadlineState(at, nowSecs());
  return (
    <p className={`flex items-start gap-2 text-body ${state.urgent ? "text-ember" : "text-bone"}`}>
      {state.urgent ? <span aria-hidden="true" className="mt-2 size-1.5 shrink-0 rotate-45 bg-ember" /> : null}
      <span>
        {children(formatDeadline(at))}
        {!state.expired ? <span className="text-steel"> (faltan {formatRemaining(state.remainingSecs)})</span> : null}
      </span>
    </p>
  );
}
