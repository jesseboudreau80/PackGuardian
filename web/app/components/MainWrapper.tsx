"use client";

import { usePathname } from "next/navigation";

export default function MainWrapper({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isMobile = pathname?.startsWith("/mobile");
  return (
    <main className={isMobile ? "" : "max-w-5xl mx-auto px-6 py-8"}>
      {children}
    </main>
  );
}
