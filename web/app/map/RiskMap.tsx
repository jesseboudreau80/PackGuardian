"use client";

import { useEffect } from "react";
import { MapContainer, TileLayer, CircleMarker, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import type { CenterHeat } from "./types";

const RISK_COLOR: Record<string, string> = {
  high:   "#EF4444",
  medium: "#F97316",
  low:    "#22C55E",
};

interface Props {
  centers: CenterHeat[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

function FitBounds({ centers }: { centers: CenterHeat[] }) {
  const map = useMap();
  useEffect(() => {
    if (centers.length === 0) return;
    const lats = centers.map((c) => c.lat);
    const lngs = centers.map((c) => c.lng);
    const bounds: [[number, number], [number, number]] = [
      [Math.min(...lats) - 0.5, Math.min(...lngs) - 0.5],
      [Math.max(...lats) + 0.5, Math.max(...lngs) + 0.5],
    ];
    map.fitBounds(bounds, { padding: [40, 40] });
  }, [centers, map]);
  return null;
}

export default function RiskMap({ centers, selectedId, onSelect }: Props) {
  const defaultCenter: [number, number] = centers.length > 0
    ? [centers[0].lat, centers[0].lng]
    : [39.5, -98.35]; // US center fallback

  return (
    <MapContainer
      center={defaultCenter}
      zoom={5}
      style={{ height: "100%", width: "100%", borderRadius: "0.75rem" }}
      zoomControl={true}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      {centers.length > 0 && <FitBounds centers={centers} />}
      {centers.map((c) => {
        const color = RISK_COLOR[c.emerging_risk_level] ?? "#6B7280";
        const isSelected = c.center_id === selectedId;
        const radius = 8 + Math.round(c.heat_score / 8);
        return (
          <CircleMarker
            key={c.center_id}
            center={[c.lat, c.lng]}
            radius={radius}
            pathOptions={{
              color: isSelected ? "#1E40AF" : color,
              fillColor: color,
              fillOpacity: isSelected ? 0.9 : 0.65,
              weight: isSelected ? 3 : 1.5,
            }}
            eventHandlers={{ click: () => onSelect(c.center_id) }}
          />
        );
      })}
    </MapContainer>
  );
}
