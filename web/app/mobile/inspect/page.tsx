"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function InspectRedirect() {
  const router = useRouter();
  useEffect(() => { router.replace("/mobile/incident"); }, [router]);
  return null;
}
