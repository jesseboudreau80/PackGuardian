interface Props {
  score: number;
}

export default function RiskScoreCard({ score }: Props) {
  const pct = Math.min(100, score);

  let trackColor = "bg-green-500";
  let textColor = "text-green-600";
  let label = "Low";
  if (score > 66) {
    trackColor = "bg-red-500";
    textColor = "text-red-600";
    label = "High";
  } else if (score > 33) {
    trackColor = "bg-yellow-500";
    textColor = "text-yellow-600";
    label = "Medium";
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <p className="text-xs text-gray-500 mb-1">Avg Risk Score</p>
      <p className={`text-2xl font-bold tabular-nums ${textColor}`}>
        {score}
        <span className="text-sm font-normal text-gray-400"> /100</span>
      </p>
      <div className="mt-2 h-1.5 w-full rounded-full bg-gray-100">
        <div
          className={`h-1.5 rounded-full transition-all ${trackColor}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className={`text-xs font-medium mt-1 ${textColor}`}>{label} overall</p>
    </div>
  );
}
