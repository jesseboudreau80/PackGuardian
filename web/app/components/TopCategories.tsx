import type { CategoryCount } from "../types/incident";

interface Props {
  categories: CategoryCount[];
}

export default function TopCategories({ categories }: Props) {
  const max = Math.max(...categories.map((c) => c.count), 1);

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
        Top Risk Categories
      </p>
      {categories.length === 0 ? (
        <p className="text-xs text-gray-400">No categorized incidents yet.</p>
      ) : (
        <div className="space-y-2.5">
          {categories.map(({ category, count }) => (
            <div key={category}>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-gray-700 font-medium">{category}</span>
                <span className="text-gray-400 tabular-nums">{count}</span>
              </div>
              <div className="h-1.5 w-full rounded-full bg-gray-100">
                <div
                  className="h-1.5 rounded-full bg-indigo-500 transition-all"
                  style={{ width: `${(count / max) * 100}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
