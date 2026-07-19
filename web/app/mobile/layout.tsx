"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { useAuth } from "../context/AuthContext";
import { useRouter } from "next/navigation";

const NAV_ITEMS = [
  { href: "/mobile",           icon: "🏠", label: "Shift"   },
  { href: "/mobile/incident",  icon: "⚠️",  label: "Report"  },
  { href: "/mobile/scan",      icon: "📷",  label: "Scan"    },
  { href: "/mobile/tips",      icon: "💡",  label: "Tips"    },
];

export default function MobileLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { isAuthenticated } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isAuthenticated) router.push("/login?from=/mobile");
  }, [isAuthenticated, router]);

  if (!isAuthenticated) return null;

  return (
    <div className="flex flex-col min-h-screen bg-gray-50 max-w-lg mx-auto"
         style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}>
      <main className="flex-1 overflow-y-auto pb-20">
        {children}
      </main>

      <nav
        className="fixed bottom-0 left-0 right-0 bg-white border-t flex"
        style={{
          maxWidth: "32rem",
          margin: "0 auto",
          paddingBottom: "env(safe-area-inset-bottom, 0px)",
          borderColor: "var(--pg-border)",
          boxShadow: "0 -1px 4px rgba(30,58,95,0.06)",
        }}
      >
        {NAV_ITEMS.map(({ href, icon, label }) => {
          const active = pathname === href || (href !== "/mobile" && pathname.startsWith(href));
          return (
            <Link
              key={href}
              href={href}
              className="flex-1 flex flex-col items-center justify-center py-3 gap-0.5 transition-colors"
              style={{ color: active ? "var(--pg-steel)" : "var(--pg-text-muted)" }}
            >
              <span className="text-xl leading-none">{icon}</span>
              <span className="text-xs font-medium">{label}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
