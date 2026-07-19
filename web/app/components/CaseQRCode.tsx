"use client";

import { useEffect, useRef } from "react";

interface Props {
  caseId: string;
  size?: number;
}

export default function CaseQRCode({ caseId, size = 96 }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const url = `${window.location.origin}/mobile/scan?case=${caseId}`;
    import("qrcode").then((QRCode) => {
      if (canvasRef.current) {
        QRCode.toCanvas(canvasRef.current, url, {
          width: size,
          margin: 1,
          color: { dark: "#1e3a5f", light: "#ffffff" },
        });
      }
    });
  }, [caseId, size]);

  return (
    <canvas
      ref={canvasRef}
      width={size}
      height={size}
      className="rounded-lg flex-shrink-0"
      style={{ border: "1px solid var(--pg-border)" }}
    />
  );
}
