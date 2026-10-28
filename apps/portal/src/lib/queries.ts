"use client";

import { unwrap } from "@saas/api-client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "./api";

export const keys = {
  config: ["portal", "config"] as const,
  home: ["portal", "home"] as const,
};

/** Role, agency status and industry labels for the shell. */
export function usePortalConfig(enabled = true) {
  return useQuery({
    queryKey: keys.config,
    queryFn: () => unwrap(api.GET("/api/portal/config")),
    enabled,
    staleTime: 60_000,
  });
}

/** Home numbers, refreshed every 30 seconds (spec 2.1). */
export function useHome() {
  return useQuery({
    queryKey: keys.home,
    queryFn: () => unwrap(api.GET("/api/portal/home")),
    refetchInterval: 30_000,
  });
}

export function useChecklistAction() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: { item: "agency_details" | "reminder_settings" | "auto_top_up"; action: "done" | "skip" | "unskip" }) =>
      unwrap(api.POST("/api/portal/checklist", { body })),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.home }),
  });
}
