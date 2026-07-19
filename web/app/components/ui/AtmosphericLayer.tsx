/* Subtle role-aware SVG atmosphere — sits behind content, never distracts */

type AtmosphereVariant = "executive" | "leadership" | "compliance" | "staff" | "neutral";

interface AtmosphericLayerProps {
  variant?: AtmosphereVariant;
  className?: string;
}

/* Dot grid pattern — very faint */
function DotGrid({ opacity = 0.06 }: { opacity?: number }) {
  return (
    <svg
      aria-hidden="true"
      className="absolute inset-0 w-full h-full"
      xmlns="http://www.w3.org/2000/svg"
      style={{ opacity }}
    >
      <defs>
        <pattern id="pg-dots" x="0" y="0" width="24" height="24" patternUnits="userSpaceOnUse">
          <circle cx="1.5" cy="1.5" r="1.5" fill="currentColor" />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#pg-dots)" />
    </svg>
  );
}

/* Subtle grid lines */
function GridLines({ opacity = 0.04 }: { opacity?: number }) {
  return (
    <svg
      aria-hidden="true"
      className="absolute inset-0 w-full h-full"
      xmlns="http://www.w3.org/2000/svg"
      style={{ opacity }}
    >
      <defs>
        <pattern id="pg-grid" x="0" y="0" width="48" height="48" patternUnits="userSpaceOnUse">
          <path d="M 48 0 L 0 0 0 48" fill="none" stroke="currentColor" strokeWidth="0.75" />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#pg-grid)" />
    </svg>
  );
}

/* Shield geometry — very faint watermark for executive/admin views */
function ShieldWatermark({ opacity = 0.035 }: { opacity?: number }) {
  return (
    <svg
      aria-hidden="true"
      className="absolute bottom-0 right-0 w-96 h-96"
      viewBox="0 0 200 220"
      xmlns="http://www.w3.org/2000/svg"
      style={{ opacity }}
      fill="currentColor"
    >
      <path d="M100 8 L180 40 L180 110 C180 158 140 195 100 212 C60 195 20 158 20 110 L20 40 Z" />
      <path
        d="M100 28 L163 55 L163 108 C163 147 133 178 100 193 C67 178 37 147 37 108 L37 55 Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        opacity="0.5"
      />
    </svg>
  );
}

/* Radar arcs — for leadership/operational views */
function RadarArcs({ opacity = 0.04 }: { opacity?: number }) {
  return (
    <svg
      aria-hidden="true"
      className="absolute -bottom-16 -right-16 w-80 h-80"
      viewBox="0 0 200 200"
      xmlns="http://www.w3.org/2000/svg"
      style={{ opacity }}
      fill="none"
      stroke="currentColor"
      strokeWidth="1"
    >
      <circle cx="200" cy="200" r="60" />
      <circle cx="200" cy="200" r="100" />
      <circle cx="200" cy="200" r="140" />
      <circle cx="200" cy="200" r="180" />
    </svg>
  );
}

/* Ambient radial glow */
function AmbientGlow({ variant }: { variant: AtmosphereVariant }) {
  const colors: Record<AtmosphereVariant, string> = {
    executive:  "radial-gradient(ellipse at 80% 20%, rgba(93,150,200,0.12) 0%, transparent 60%)",
    leadership: "radial-gradient(ellipse at 70% 30%, rgba(61,107,158,0.10) 0%, transparent 55%)",
    compliance: "radial-gradient(ellipse at 20% 80%, rgba(61,107,158,0.08) 0%, transparent 50%)",
    staff:      "radial-gradient(ellipse at 50% 0%, rgba(91,141,184,0.10) 0%, transparent 60%)",
    neutral:    "none",
  };
  return (
    <div
      aria-hidden="true"
      className="absolute inset-0 pointer-events-none"
      style={{ background: colors[variant] }}
    />
  );
}

export default function AtmosphericLayer({ variant = "neutral", className = "" }: AtmosphericLayerProps) {
  if (variant === "neutral") return null;

  return (
    <div
      aria-hidden="true"
      className={`absolute inset-0 pointer-events-none overflow-hidden text-white ${className}`}
    >
      <AmbientGlow variant={variant} />

      {variant === "executive" && (
        <>
          <GridLines opacity={0.06} />
          <ShieldWatermark opacity={0.045} />
        </>
      )}

      {variant === "leadership" && (
        <>
          <DotGrid opacity={0.07} />
          <RadarArcs opacity={0.055} />
        </>
      )}

      {variant === "compliance" && (
        <GridLines opacity={0.08} />
      )}

      {variant === "staff" && (
        <DotGrid opacity={0.05} />
      )}
    </div>
  );
}
