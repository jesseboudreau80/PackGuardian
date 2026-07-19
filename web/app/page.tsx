"use client";

import { lazy, Suspense } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "./context/AuthContext";
import { useWorkspace } from "./context/WorkspaceContext";
import Link from "next/link";

// Lazy-loaded role views — only the active view's code is downloaded
const AdminManagerView    = lazy(() => import("./components/workspace/AdminManagerView"));
const SafetyView          = lazy(() => import("./components/workspace/SafetyView"));
const HRView              = lazy(() => import("./components/workspace/HRView"));
const LegalHRView         = lazy(() => import("./components/workspace/LegalHRView"));
const CenterManagerView   = lazy(() => import("./components/workspace/CenterManagerView"));
const DistrictManagerView = lazy(() => import("./components/workspace/DistrictManagerView"));
const FieldStaffView      = lazy(() => import("./components/workspace/FieldStaffView"));

function ViewSkeleton() {
  return (
    <div className="flex flex-col gap-4 animate-pulse">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="pg-skeleton h-20 rounded-xl" />
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="pg-skeleton h-48 rounded-xl" />
        ))}
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const { isAuthenticated } = useAuth();
  const { profile, loading } = useWorkspace();
  const router = useRouter();

  if (!isAuthenticated) {
    if (typeof window !== "undefined") router.push("/login");
    return null;
  }

  if (loading) return <ViewSkeleton />;

  const role = profile?.primary_role ?? "manager";

  return (
    <div className="flex flex-col gap-5">
      {/* Role-contextual header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-lg font-semibold leading-tight" style={{ color: "var(--pg-navy)" }}>
            {profile?.dashboard_title ?? "PackGuardian"}
          </h1>
          <p className="text-sm mt-0.5" style={{ color: "var(--pg-text-muted)" }}>
            {profile?.dashboard_subtitle}
          </p>
        </div>
        {profile?.is_admin && (
          <Link
            href="/settings/tenant"
            className="text-xs hover:underline mt-0.5 transition-colors"
            style={{ color: "var(--pg-text-muted)" }}
          >
            Workspace Settings →
          </Link>
        )}
      </div>

      {/* Role-specific view */}
      <Suspense fallback={<ViewSkeleton />}>
        {role === "safety"                              && <SafetyView />}
        {role === "hr"                                  && <HRView />}
        {role === "legal"                               && <LegalHRView />}
        {role === "center_manager"                      && <CenterManagerView />}
        {(role === "district_manager" || role === "area_manager") && <DistrictManagerView />}
        {(role === "field_staff" || role === "benefits") && <FieldStaffView />}
        {(role === "admin" || role === "manager" || role === "operations") && <AdminManagerView />}
      </Suspense>
    </div>
  );
}
