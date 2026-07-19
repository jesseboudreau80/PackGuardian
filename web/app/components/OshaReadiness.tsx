"use client";

import Link from "next/link";

interface IncidentData {
  id: string;
  incident_type: string;
  employee_name: string | null;
  job_title?: string | null;
  date_of_injury?: string | null;
  body_part: string | null;
  treatment_type: string | null;
  days_away?: number | null;
  restricted_days?: number | null;
  recordable: boolean | null;
  is_finalized?: boolean;
}

interface CheckItem {
  label: string;
  ok: boolean;
  required: boolean;
  hint?: string;
}

const EMPLOYEE_TYPES = new Set(["dog_bite", "employee_injury", "slip_fall", "chemical", "grooming"]);
const BODY_PART_TYPES = new Set(["dog_bite", "employee_injury", "slip_fall", "chemical"]);

function computeChecklist(incident: IncidentData): CheckItem[] {
  const isEmployee = EMPLOYEE_TYPES.has(incident.incident_type);
  const needsBody = BODY_PART_TYPES.has(incident.incident_type);

  const items: CheckItem[] = [];

  if (isEmployee) {
    items.push({
      label: "Employee name",
      ok: !!incident.employee_name?.trim(),
      required: true,
      hint: "Required for OSHA 301",
    });
    items.push({
      label: "Job title",
      ok: !!incident.job_title?.trim(),
      required: false,
      hint: "Recommended for 300 log",
    });
    items.push({
      label: "Date of injury",
      ok: !!incident.date_of_injury,
      required: true,
      hint: "Required for recordability determination",
    });
  }

  items.push({
    label: "Treatment type",
    ok: !!incident.treatment_type,
    required: true,
    hint: "Determines recordability (first aid vs medical)",
  });

  if (needsBody) {
    items.push({
      label: "Body part affected",
      ok: !!incident.body_part?.trim(),
      required: false,
      hint: "Required for OSHA 300 log injury column",
    });
  }

  items.push({
    label: "Recordability determined",
    ok: incident.recordable !== null && incident.recordable !== undefined,
    required: true,
    hint: "System determines this from treatment type and days away",
  });

  if (isEmployee) {
    items.push({
      label: "Days away / restricted",
      ok: (incident.days_away !== null && incident.days_away !== undefined)
        || (incident.restricted_days !== null && incident.restricted_days !== undefined),
      required: false,
      hint: "Required if employee missed work or had restricted duty",
    });
  }

  return items;
}

export default function OshaReadiness({ incident, compact = false }: {
  incident: IncidentData;
  compact?: boolean;
}) {
  // Only relevant for potentially recordable incident types
  if (!EMPLOYEE_TYPES.has(incident.incident_type) && incident.recordable !== true) {
    return null;
  }

  const checklist = computeChecklist(incident);
  const required = checklist.filter((c) => c.required);
  const completedRequired = required.filter((c) => c.ok).length;
  const allRequired = required.length;
  const isReady = completedRequired === allRequired && incident.recordable !== null;
  const isFinalized = incident.is_finalized ?? false;

  const pct = allRequired > 0 ? Math.round((completedRequired / allRequired) * 100) : 100;

  if (compact) {
    return (
      <div className={`inline-flex items-center gap-1.5 text-xs px-2 py-0.5 rounded-full font-medium border ${
        isFinalized ? "bg-green-50 text-green-700 border-green-200"
        : isReady ? "bg-blue-50 text-blue-700 border-blue-200"
        : "bg-amber-50 text-amber-700 border-amber-200"
      }`}>
        {isFinalized ? "✓ OSHA Finalized"
         : isReady ? "◎ OSHA Ready"
         : `⚠ OSHA ${pct}% complete`}
      </div>
    );
  }

  const missing = checklist.filter((c) => !c.ok && c.required);

  return (
    <div className={`rounded-xl border p-4 space-y-3 ${
      isFinalized ? "bg-green-50 border-green-200"
      : isReady ? "bg-blue-50 border-blue-200"
      : "bg-amber-50 border-amber-200"
    }`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-base">{isFinalized ? "✓" : isReady ? "◎" : "⚠"}</span>
          <div>
            <p className={`text-sm font-semibold ${
              isFinalized ? "text-green-800"
              : isReady ? "text-blue-800"
              : "text-amber-800"
            }`}>
              {isFinalized ? "OSHA Documentation Finalized"
               : isReady ? "OSHA Documentation Ready"
               : "OSHA Documentation Incomplete"}
            </p>
            <p className={`text-xs mt-0.5 ${
              isFinalized ? "text-green-600"
              : isReady ? "text-blue-600"
              : "text-amber-600"
            }`}>
              {completedRequired}/{allRequired} required fields complete
            </p>
          </div>
        </div>
        {!isFinalized && (
          <Link href={`/osha`} className={`text-xs underline ${
            isReady ? "text-blue-600" : "text-amber-600"
          }`}>
            Open OSHA →
          </Link>
        )}
      </div>

      {/* Progress bar */}
      <div className="h-1.5 bg-white/50 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all ${
          isFinalized ? "bg-green-500"
          : isReady ? "bg-blue-500"
          : "bg-amber-500"
        }`} style={{ width: `${pct}%` }} />
      </div>

      {/* Missing fields */}
      {missing.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-amber-800">Still needed:</p>
          {missing.map((item) => (
            <div key={item.label} className="flex items-start gap-2">
              <span className="text-xs text-amber-500 flex-shrink-0 mt-0.5">○</span>
              <div>
                <p className="text-xs text-amber-800 font-medium">{item.label}</p>
                {item.hint && <p className="text-xs text-amber-600">{item.hint}</p>}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* All complete - action */}
      {isReady && !isFinalized && (
        <p className="text-xs text-blue-700">
          All required fields are complete. Review and finalize in the OSHA section when the investigation is closed.
        </p>
      )}
    </div>
  );
}
