"use client";

import { useEffect, useState } from "react";

interface Incident {
  id: number;
  employee_name: string;
  incident_date: string;
  description: string;
  severity: string;
}

export default function Home() {
  const [incidents, setIncidents] = useState<Incident[]>([]);

  useEffect(() => {
      fetch(`${process.env.NEXT_PUBLIC_API_URL}/incidents/`)
      .then(res => res.json())
      .then(data => setIncidents(data));
  }, []);

  return (
    <div className="min-h-screen bg-gray-100 p-8">
      <h1 className="text-3xl font-bold mb-6">PAWSitiveOps OSHA Dashboard</h1>

      <div className="grid gap-4">
        {incidents.map((incident) => (
          <div
            key={incident.id}
            className="bg-white shadow rounded p-4 border"
          >
            <h2 className="font-semibold text-lg">
              {incident.employee_name}
            </h2>
            <p className="text-sm text-gray-500">
              {incident.incident_date}
            </p>
            <p className="mt-2">{incident.description}</p>
            <span className="inline-block mt-3 px-3 py-1 text-sm bg-red-100 text-red-700 rounded">
              {incident.severity}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
