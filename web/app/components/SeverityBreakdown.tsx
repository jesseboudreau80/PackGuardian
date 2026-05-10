import type { Severity } from "../types/incident";

interface SeverityRow {
  severity: Severity;
  count: number;
}

interface Props {
  breakdown: SeverityRow[];
  max: number;
}

const severityStyles: Record<Severity, { bar: string; label: string }> = {
  low:      { bar: "bg-green-400",  label: "text-green-700"  },
  medium:   { bar: "bg-yellow-400", label: "text-yellow-700" },
  high:     { bar: "bg-orange-400", label: "text-orange-700" },
  critical: { bar: "bg-red-500",    label: "text-red-700"    },
};

export default function SeverityBreakdown({ breakdown, max }: Props) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
        Severity Breakdown
      </p>
      <div className="space-y-2.5">
        {breakdown.map(({ severity, count }) => {
          const styles = severityStyles[severity];
          return (
            <div key={severity}>
              <div className="flex justify-between text-xs mb-1">
                <span className={`font-medium capitalize ${styles.label}`}>
                  {severity}
                </span>
                <span className="text-gray-400 tabular-nums">{count}</span>
              </div>
              <div className="h-1.5 w-full rounded-full bg-gray-100">
                <div
                  className={`h-1.5 rounded-full transition-all ${styles.bar}`}
                  style={{ width: count === 0 ? "0%" : `${(count / max) * 100}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
