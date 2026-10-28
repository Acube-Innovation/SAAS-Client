"use client";

import { usePortalConfig } from "@/lib/queries";

/** Whether the signed-in user may approve, send back and raise change requests (spec 1.1). */
export function useCanReview() {
  const config = usePortalConfig();
  const role = config.data?.role;
  return (role === "owner" || role === "manager") && config.data?.tenant_status !== "suspended";
}
