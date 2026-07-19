"use client";

import Link from "next/link";
import { useWorkspace } from "../../context/WorkspaceContext";

/* Maps the color key to a subtle tinted tile style */
const TILE_STYLES: Record<string, { icon: string; border: string; bg: string; label: string }> = {
  red:    { icon: "rgba(220,38,38,0.12)",  border: "rgba(220,38,38,0.2)",   bg: "rgba(254,242,242,0.6)", label: "#9b1c1c" },
  green:  { icon: "rgba(22,163,74,0.12)",  border: "rgba(22,163,74,0.2)",   bg: "rgba(240,253,244,0.6)", label: "#14532d" },
  blue:   { icon: "rgba(37,99,235,0.12)",  border: "rgba(37,99,235,0.2)",   bg: "rgba(239,246,255,0.6)", label: "#1e3a8a" },
  indigo: { icon: "rgba(30,58,95,0.10)",   border: "rgba(30,58,95,0.18)",   bg: "rgba(238,242,248,0.6)", label: "#1e3a5f" },
  purple: { icon: "rgba(124,58,237,0.10)", border: "rgba(124,58,237,0.18)", bg: "rgba(245,243,255,0.6)", label: "#4c1d95" },
  orange: { icon: "rgba(234,88,12,0.12)",  border: "rgba(234,88,12,0.2)",   bg: "rgba(255,247,237,0.6)", label: "#7c2d12" },
  gray:   { icon: "rgba(30,58,95,0.08)",   border: "rgba(30,58,95,0.14)",   bg: "rgba(248,250,252,0.8)", label: "#334155" },
};

export default function QuickActions() {
  const { profile } = useWorkspace();
  const actions = profile?.quick_actions ?? [];

  if (actions.length === 0) return null;

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5">
      {actions.slice(0, 6).map((a) => {
        const style = TILE_STYLES[a.color] ?? TILE_STYLES.indigo;
        return (
          <Link
            key={a.href + a.label}
            href={a.href}
            className="flex items-center gap-3 px-4 py-3.5 rounded-xl border bg-white transition-all group"
            style={{
              borderColor: style.border,
              background: style.bg,
              boxShadow: "0 1px 2px rgba(30,58,95,0.05)",
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLElement).style.boxShadow = "0 4px 12px rgba(30,58,95,0.10), 0 2px 4px rgba(30,58,95,0.06)";
              (e.currentTarget as HTMLElement).style.transform = "translateY(-1px)";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLElement).style.boxShadow = "0 1px 2px rgba(30,58,95,0.05)";
              (e.currentTarget as HTMLElement).style.transform = "translateY(0)";
            }}
          >
            {/* Icon container */}
            <span
              className="flex items-center justify-center w-8 h-8 rounded-lg text-base shrink-0"
              style={{ background: style.icon }}
            >
              {a.icon}
            </span>
            {/* Label */}
            <span
              className="text-xs font-semibold leading-tight"
              style={{ color: style.label }}
            >
              {a.label}
            </span>
          </Link>
        );
      })}
    </div>
  );
}
