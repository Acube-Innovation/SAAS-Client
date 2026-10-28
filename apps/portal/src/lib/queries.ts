"use client";

import { unwrap } from "@saas/api-client";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "./api";

export const keys = {
  config: ["portal", "config"] as const,
  home: ["portal", "home"] as const,
  agency: ["portal", "agency"] as const,
  subscribers: ["portal", "subscribers"] as const,
  areas: ["portal", "areas"] as const,
  staff: ["portal", "staff"] as const,
  users: ["portal", "users"] as const,
  reminderSettings: ["portal", "reminder-settings"] as const,
  imports: ["portal", "imports"] as const,
  bookings: ["portal", "bookings"] as const,
  deliveries: ["portal", "deliveries"] as const,
  followUps: ["portal", "follow-ups"] as const,
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

export function useAgency() {
  return useQuery({ queryKey: keys.agency, queryFn: () => unwrap(api.GET("/api/portal/agency")) });
}

export function useSubscribers(query: Record<string, string>) {
  return useQuery({
    queryKey: [...keys.subscribers, query],
    queryFn: () => unwrap(api.GET("/api/portal/subscribers", { params: { query } })),
    placeholderData: keepPreviousData,
  });
}

export function useSubscriber(id: string) {
  return useQuery({
    queryKey: [...keys.subscribers, id],
    queryFn: () => unwrap(api.GET("/api/portal/subscribers/{id}", { params: { path: { id } } })),
  });
}

export function useAreas(activeOnly = false) {
  return useQuery({
    queryKey: [...keys.areas, activeOnly],
    queryFn: () =>
      unwrap(api.GET("/api/portal/areas", { params: { query: activeOnly ? { active: true } : {} } })),
  });
}

export function useStaff(enabled = true) {
  return useQuery({
    queryKey: keys.staff,
    queryFn: () => unwrap(api.GET("/api/portal/staff")),
    enabled,
  });
}

export function useTeam() {
  return useQuery({ queryKey: keys.users, queryFn: () => unwrap(api.GET("/api/portal/users")) });
}

export function useReminderSettings() {
  return useQuery({
    queryKey: keys.reminderSettings,
    queryFn: () => unwrap(api.GET("/api/portal/reminder-settings")),
  });
}

/** Poll an import while its background job runs (preview, confirm). */
export function useImportJob(id: string | null) {
  return useQuery({
    queryKey: [...keys.imports, id],
    enabled: Boolean(id),
    queryFn: () => unwrap(api.GET("/api/portal/imports/{id}", { params: { path: { id: id! } } })),
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status === "uploaded" || status === "previewing" || status === "confirming" ? 1000 : false;
    },
  });
}

/** After a write: refresh everything that may show it (lists, Home numbers, checklist). */
export function useRefresh() {
  const queryClient = useQueryClient();
  return (...groups: readonly (readonly string[])[]) =>
    Promise.all([...groups, keys.home].map((queryKey) => queryClient.invalidateQueries({ queryKey })));
}

export function useBookings(query: Record<string, string>) {
  return useQuery({
    queryKey: [...keys.bookings, query],
    queryFn: () => unwrap(api.GET("/api/portal/bookings", { params: { query } })),
    placeholderData: keepPreviousData,
  });
}

export function useBooking(id: string) {
  return useQuery({
    queryKey: [...keys.bookings, id],
    queryFn: () => unwrap(api.GET("/api/portal/bookings/{id}", { params: { path: { id } } })),
  });
}

export function useTimeline(id: string | null) {
  return useQuery({
    queryKey: [...keys.bookings, id, "timeline"],
    enabled: Boolean(id),
    queryFn: () => unwrap(api.GET("/api/portal/bookings/{id}/timeline", { params: { path: { id: id! } } })),
  });
}

export function useDeliveries(date: string) {
  return useQuery({
    queryKey: [...keys.deliveries, date],
    queryFn: () =>
      unwrap(api.GET("/api/portal/deliveries", { params: { query: date ? { date } : {} } })),
    placeholderData: keepPreviousData,
  });
}

export function useFollowUps(query: Record<string, string>) {
  return useQuery({
    queryKey: [...keys.followUps, query],
    queryFn: () => unwrap(api.GET("/api/portal/follow-ups", { params: { query } })),
    placeholderData: keepPreviousData,
    refetchInterval: 60_000,
  });
}
