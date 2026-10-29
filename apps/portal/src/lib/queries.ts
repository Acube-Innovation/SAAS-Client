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
  content: ["portal", "content"] as const,
  changeRequests: ["portal", "change-requests"] as const,
  log: ["portal", "communication-log"] as const,
  reports: ["portal", "reports"] as const,
  billing: ["portal", "billing"] as const,
  integrations: ["portal", "integrations"] as const,
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

/** Messages and voice (spec 2.6): view-only content. */
export function useContentTemplates() {
  return useQuery({
    queryKey: [...keys.content, "templates"],
    queryFn: () => unwrap(api.GET("/api/portal/content/templates")),
  });
}

export function useVoiceScripts(enabled = true) {
  return useQuery({
    queryKey: [...keys.content, "voice-scripts"],
    queryFn: () => unwrap(api.GET("/api/portal/content/voice-scripts")),
    enabled,
  });
}

export function useQuestionFlows(enabled = true) {
  return useQuery({
    queryKey: [...keys.content, "question-flows"],
    queryFn: () => unwrap(api.GET("/api/portal/content/question-flows")),
    enabled,
  });
}

export function useChangeRequests(query: Record<string, string>, enabled = true) {
  return useQuery({
    queryKey: [...keys.changeRequests, query],
    queryFn: () => unwrap(api.GET("/api/portal/change-requests", { params: { query } })),
    placeholderData: keepPreviousData,
    enabled,
  });
}

export function useChangeRequest(id: string) {
  return useQuery({
    queryKey: [...keys.changeRequests, id],
    queryFn: () => unwrap(api.GET("/api/portal/change-requests/{id}", { params: { path: { id } } })),
  });
}

/** Communication log (spec 2.8): every message and call with its replies. */
export function useCommunicationLog(query: Record<string, string>) {
  return useQuery({
    queryKey: [...keys.log, query],
    queryFn: () => unwrap(api.GET("/api/portal/communication-log", { params: { query } })),
    placeholderData: keepPreviousData,
  });
}

/** Reports (spec 2.5). */
export function useReminderResults(query: Record<string, string>) {
  return useQuery({
    queryKey: [...keys.reports, "reminder-results", query],
    queryFn: () => unwrap(api.GET("/api/portal/reports/reminder-results", { params: { query } })),
    placeholderData: keepPreviousData,
  });
}

export function useFollowUpAgeing(query: Record<string, string>) {
  return useQuery({
    queryKey: [...keys.reports, "follow-up-ageing", query],
    queryFn: () => unwrap(api.GET("/api/portal/reports/follow-up-ageing", { params: { query } })),
    placeholderData: keepPreviousData,
  });
}

export function useSubscriberHealth(query: Record<string, string>) {
  return useQuery({
    queryKey: [...keys.reports, "subscriber-health", query],
    queryFn: () => unwrap(api.GET("/api/portal/reports/subscriber-health", { params: { query } })),
    placeholderData: keepPreviousData,
  });
}

/** Wallet and billing (spec 2.9). */
export function useWallet() {
  return useQuery({ queryKey: [...keys.billing, "wallet"], queryFn: () => unwrap(api.GET("/api/portal/wallet")) });
}

export function useWalletTransactions(page: number) {
  return useQuery({
    queryKey: [...keys.billing, "transactions", page],
    queryFn: () => unwrap(api.GET("/api/portal/wallet/transactions", { params: { query: { page } } })),
    placeholderData: keepPreviousData,
  });
}

export function useInvoices(page: number) {
  return useQuery({
    queryKey: [...keys.billing, "invoices", page],
    queryFn: () => unwrap(api.GET("/api/portal/invoices", { params: { query: { page } } })),
    placeholderData: keepPreviousData,
  });
}

export function useAutoTopUp() {
  return useQuery({ queryKey: [...keys.billing, "auto-top-up"], queryFn: () => unwrap(api.GET("/api/portal/auto-top-up")) });
}

export function usePlan() {
  return useQuery({ queryKey: [...keys.billing, "plan"], queryFn: () => unwrap(api.GET("/api/portal/plan")) });
}

/** Integrations (spec 2.10). */
export function useApiKeys() {
  return useQuery({ queryKey: [...keys.integrations, "keys"], queryFn: () => unwrap(api.GET("/api/portal/integrations/api-keys")) });
}

export function useWebhookEndpoints() {
  return useQuery({ queryKey: [...keys.integrations, "webhooks"], queryFn: () => unwrap(api.GET("/api/portal/integrations/webhooks")) });
}

export function useEventTypes() {
  return useQuery({ queryKey: [...keys.integrations, "event-types"], queryFn: () => unwrap(api.GET("/api/portal/integrations/event-types")), staleTime: Infinity });
}

export function useWebhookDeliveries(query: Record<string, string>) {
  return useQuery({
    queryKey: [...keys.integrations, "deliveries", query],
    queryFn: () => unwrap(api.GET("/api/portal/integrations/deliveries", { params: { query } })),
    placeholderData: keepPreviousData,
    refetchInterval: 10_000,
  });
}
