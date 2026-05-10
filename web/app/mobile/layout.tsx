"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { useAuth } from "../context/AuthContext";
import { useRouter } from "next/navigation";

const NAV_ITEMS = [
  { href: "/mobile",         icon: "🏠", label: "Shift"   },
  { href: "/mobile/incident", icon: "⚠️",  label: "Report" },
  { href: "/mobile/inspect",  icon: "✅",  label: "Inspect" },
  { href: "/mobile/scan",     icon: "📷",  label: "Scan"   },
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
      {/* Content area */}
      <main className="flex-1 overflow-y-auto pb-20">
        {children}
      </main>

      {/* Bottom navigation */}
      <nav
        className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 flex"
        style={{
          maxWidth: "32rem",
          margin: "0 auto",
          paddingBottom: "env(safe-area-inset-bottom, 0px)",
        }}
      >
        {NAV_ITEMS.map(({ href, icon, label }) => {
          const active = pathname === href || (href !== "/mobile" && pathname.startsWith(href));
          return (
            <Link
              key={href}
              href={href}
              className={`flex-1 flex flex-col items-center justify-center py-3 gap-0.5 transition-colors ${
                active ? "text-indigo-600" : "text-gray-400 hover:text-gray-600"
              }`}
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
