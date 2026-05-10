"use client";

import { lazy, Suspense } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "./context/AuthContext";
import { useWorkspace } from "./context/WorkspaceContext";

// Lazy-loaded role views — only the active view's code is downloaded
const AdminManagerView    = lazy(() => import("./components/workspace/AdminManagerView"));
const SafetyView          = lazy(() => import("./components/workspace/SafetyView"));
const HRView              = lazy(() => import("./components/workspace/HRView"));
const CenterManagerView   = lazy(() => import("./components/workspace/CenterManagerView"));
const DistrictManagerView = lazy(() => import("./components/workspace/DistrictManagerView"));
const FieldStaffView      = lazy(() => import("./components/workspace/FieldStaffView"));

function ViewSkeleton() {
  return (
    <div className="flex flex-col gap-4 animate-pulse">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="bg-white rounded-xl border border-gray-200 h-20" />
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="bg-white rounded-xl border border-gray-200 h-48" />
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
    <div className="flex flex-col gap-4">
      {/* Role-contextual header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">
            {profile?.dashboard_title ?? "PackGuardian"}
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {profile?.dashboard_subtitle}
          </p>
        </div>
        {profile?.is_admin && (
          <a href="/settings/tenant"
            className="text-xs text-gray-400 hover:text-indigo-600 hover:underline">
            Workspace Settings →
          </a>
        )}
      </div>

      {/* Role-specific view — lazy-loaded, only active bundle is fetched */}
      <Suspense fallback={<ViewSkeleton />}>
        {role === "safety"                              && <SafetyView />}
        {role === "hr"                                  && <HRView />}
        {role === "center_manager"                      && <CenterManagerView />}
        {(role === "district_manager" || role === "area_manager") && <DistrictManagerView />}
        {(role === "field_staff" || role === "benefits" || role === "legal") && <FieldStaffView />}
        {(role === "admin" || role === "manager" || role === "operations") && <AdminManagerView />}
      </Suspense>
    </div>
  );
}
