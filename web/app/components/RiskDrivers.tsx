import type {
  EmergingRisk,
  PatternAnalysis,
  KeywordCount,
  RecommendedAction,
  RiskTrend,
  SeverityTransition,
} from "../types/incident";

const severityColors: Record<string, string> = {
  low: "text-green-700",
  medium: "text-yellow-700",
  high: "text-orange-700",
  critical: "text-red-700",
};

function KeywordPills({
  items,
  color,
}: {
  items: KeywordCount[];
  color: "indigo" | "red";
}) {
  if (items.length === 0)
    return <p className="text-xs text-gray-400">None detected yet.</p>;

  const base =
    color === "indigo"
      ? "bg-indigo-50 text-indigo-700"
      : "bg-red-50 text-red-700";

  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map(({ keyword, count }) => (
        <span
          key={keyword}
          className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full font-medium ${base}`}
        >
          {keyword}
          <span className="bg-white/60 rounded-full px-1 tabular-nums font-bold">
            {count}
          </span>
        </span>
      ))}
    </div>
  );
}

function TransitionRow({ t }: { t: SeverityTransition }) {
  return (
    <span className="inline-flex items-center gap-1 text-xs">
      <span className={`font-medium ${severityColors[t.from_severity] ?? "text-gray-600"}`}>
        {t.from_severity}
      </span>
      <span className="text-gray-400">→</span>
      <span className={`font-medium ${severityColors[t.to_severity] ?? "text-gray-600"}`}>
        {t.to_severity}
      </span>
      <span className="text-gray-400 tabular-nums">×{t.count}</span>
    </span>
  );
}

const trendArrow: Record<RiskTrend, string> = {
  increasing: "↑",
  stable:     "→",
  decreasing: "↓",
};

const trendColor: Record<RiskTrend, string> = {
  increasing: "text-red-500",
  stable:     "text-gray-400",
  decreasing: "text-green-500",
};

function EmergingRiskRow({ risk }: { risk: EmergingRisk }) {
  const style = priorityStyles[risk.risk_level];
  return (
    <li className="flex items-center gap-3">
      <span className={`text-base font-bold w-4 text-center ${trendColor[risk.trend]}`}>
        {trendArrow[risk.trend]}
      </span>
      <span className="flex-1 text-sm text-gray-700">{risk.keyword}</span>
      <span className={`text-xs font-medium px-2 py-0.5 rounded ${style.badge}`}>
        {style.label}
      </span>
    </li>
  );
}

const priorityStyles = {
  low:    { badge: "bg-gray-100 text-gray-600",   label: "Low"    },
  medium: { badge: "bg-yellow-100 text-yellow-700", label: "Medium" },
  high:   { badge: "bg-red-100 text-red-700",     label: "High"   },
};

function ActionItem({ item }: { item: RecommendedAction }) {
  const style = priorityStyles[item.priority];
  return (
    <li className="flex items-start gap-3">
      <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border border-gray-300 bg-white" />
      <div className="flex-1 min-w-0">
        <p className="text-sm text-gray-700">{item.action}</p>
      </div>
      <div className="shrink-0 flex items-center gap-2">
        <span className="text-xs text-gray-400 tabular-nums">
          {Math.round(item.confidence * 100)}%
        </span>
        <span className={`text-xs font-medium px-2 py-0.5 rounded ${style.badge}`}>
          {style.label}
        </span>
      </div>
    </li>
  );
}

interface Props {
  patterns: PatternAnalysis;
}

export default function RiskDrivers({ patterns }: Props) {
  const hasData =
    patterns.top_category_keywords.length > 0 ||
    patterns.top_escalation_keywords.length > 0;

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4 space-y-4">
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
        Risk Drivers
      </p>

      {patterns.summary && (
        <p className="text-sm text-gray-600 italic border-l-2 border-indigo-200 pl-3">
          {patterns.summary}
        </p>
      )}

      {!hasData ? (
        <p className="text-xs text-gray-400">
          No pattern data yet — add more incidents to surface trends.
        </p>
      ) : (
        <div className="grid sm:grid-cols-2 gap-5">
          {/* Category keywords */}
          <div>
            <p className="text-xs font-medium text-gray-500 mb-2">
              Top Incident Keywords
            </p>
            <KeywordPills items={patterns.top_category_keywords} color="indigo" />
          </div>

          {/* Escalation triggers */}
          <div>
            <p className="text-xs font-medium text-gray-500 mb-2">
              Top Escalation Triggers
            </p>
            <KeywordPills items={patterns.top_escalation_keywords} color="red" />
          </div>

          {/* Severity transitions */}
          {patterns.severity_transitions.length > 0 && (
            <div className="sm:col-span-2">
              <p className="text-xs font-medium text-gray-500 mb-2">
                Severity Escalation Patterns
              </p>
              <div className="flex flex-wrap gap-3">
                {patterns.severity_transitions.map((t, i) => (
                  <TransitionRow key={i} t={t} />
                ))}
              </div>
            </div>
          )}

          {/* Emerging risks */}
          {patterns.emerging_risks.length > 0 && (
            <div className="sm:col-span-2 border-t border-gray-100 pt-4">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
                Emerging Risks
              </p>
              <ul className="space-y-2">
                {patterns.emerging_risks.map((risk, i) => (
                  <EmergingRiskRow key={i} risk={risk} />
                ))}
              </ul>
            </div>
          )}

          {/* Recommended actions */}
          {patterns.recommended_actions.length > 0 && (
            <div className="sm:col-span-2 border-t border-gray-100 pt-4">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
                Recommended Actions
              </p>
              <ul className="space-y-2.5">
                {patterns.recommended_actions.map((item, i) => (
                  <ActionItem key={i} item={item} />
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
