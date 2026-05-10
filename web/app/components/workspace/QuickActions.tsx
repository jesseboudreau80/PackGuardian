"use client";

import Link from "next/link";
import { useWorkspace } from "../../context/WorkspaceContext";

const COLOR_MAP: Record<string, string> = {
  red:    "bg-red-600 hover:bg-red-700",
  green:  "bg-green-600 hover:bg-green-700",
  blue:   "bg-blue-600 hover:bg-blue-700",
  indigo: "bg-indigo-600 hover:bg-indigo-700",
  purple: "bg-purple-600 hover:bg-purple-700",
  orange: "bg-orange-500 hover:bg-orange-600",
  gray:   "bg-gray-600 hover:bg-gray-700",
};

export default function QuickActions() {
  const { profile } = useWorkspace();
  const actions = profile?.quick_actions ?? [];

  if (actions.length === 0) return null;

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
      {actions.slice(0, 6).map((a) => (
        <Link
          key={a.href + a.label}
          href={a.href}
          className={`flex flex-col items-center gap-2 text-white rounded-2xl py-5 px-3 text-center
            transition-opacity active:opacity-80 ${COLOR_MAP[a.color] ?? "bg-indigo-600"}`}
        >
          <span className="text-3xl leading-none">{a.icon}</span>
          <span className="text-xs font-semibold leading-tight">{a.label}</span>
        </Link>
      ))}
    </div>
  );
}
