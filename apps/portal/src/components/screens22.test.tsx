import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";

import { mockApi, navigation, portalConfig, renderWithQuery } from "@/test/utils";

import { IntegrationsScreen } from "./integrations/integrations-screen";

beforeEach(() => {
  navigation.pathname = "/integrations";
  navigation.search = new URLSearchParams();
});

const key = (overrides = {}) => ({
  id: "k1", name: "Billing software", prefix: "sck_…Ab12Cd", rate_limit_per_minute: 120, created_at: "2026-10-29T06:00:00Z",
  created_by_email: "owner@agency.test", last_used_at: null, revoked_at: null, ...overrides,
});
const endpoint = (overrides = {}) => ({
  id: "w1", url: "https://erp.agency.test/hooks", events: ["outcome.recorded"], secret: "whsec_supersecret", is_active: true,
  created_at: "2026-10-29T06:00:00Z", ...overrides,
});
const delivery = (overrides = {}) => ({
  id: "d1", event_id: "e1", event_type: "outcome.recorded", endpoint_id: "w1", endpoint_url: "https://erp.agency.test/hooks",
  status: "succeeded", attempts: 1, last_status_code: 200, last_error: "", last_attempt_at: "2026-10-29T06:00:00Z",
  next_attempt_at: null, delivered_at: "2026-10-29T06:00:00Z", created_at: "2026-10-29T06:00:00Z",
  payload: { id: "e1", type: "outcome.recorded", data: { booking_reference: "BK1" } }, ...overrides,
});
const EVENTS = [
  { code: "booking.created", label: "Booking created" },
  { code: "outcome.recorded", label: "Customer answer recorded" },
];
const base = (more: Parameters<typeof mockApi>[0] = []) => [
  { method: "GET", path: "/api/portal/config", body: portalConfig({ role: "owner" }) },
  { method: "GET", path: "/api/portal/integrations/event-types", body: EVENTS },
  { method: "GET", path: "/api/auth/csrf", status: 204 },
  ...more,
];

describe("Integrations", () => {
  it("creates an API key and shows it once, then revokes a key", async () => {
    const calls = mockApi(base([
      { method: "GET", path: "/api/portal/integrations/api-keys", body: [key()] },
      { method: "GET", path: "/api/portal/integrations/webhooks", body: [] },
      { method: "GET", path: "/api/portal/integrations/deliveries", body: { count: 0, next: null, previous: null, results: [] } },
      { method: "POST", path: "/api/portal/integrations/api-keys", status: 201, body: { key: key({ id: "k2", name: "ERP" }), secret: "sck_abc_SECRETVALUE" } },
      { method: "POST", path: "/api/portal/integrations/api-keys/k1/revoke", body: key({ revoked_at: "2026-10-29T07:00:00Z" }) },
    ]));
    renderWithQuery(<IntegrationsScreen />);
    const section = await screen.findByRole("region", { name: "API keys" });
    expect(await within(section).findByText("sck_…Ab12Cd")).toBeInTheDocument();
    await userEvent.type(within(section).getByLabelText("Key name"), "ERP");
    await userEvent.click(within(section).getByRole("button", { name: "Create key" }));
    const dialog = await screen.findByRole("dialog", { name: 'API key "ERP" created' });
    expect(within(dialog).getByTestId("new-api-key")).toHaveTextContent("sck_abc_SECRETVALUE");
    expect(dialog).toHaveTextContent("shown only once");
    await userEvent.click(within(dialog).getByRole("button", { name: "I've copied it" }));
    expect(screen.queryByText("sck_abc_SECRETVALUE")).not.toBeInTheDocument();
    expect(calls.find((c) => c.method === "POST" && c.path.endsWith("/api-keys"))?.body).toEqual({ name: "ERP" });

    await userEvent.click(within(section).getByRole("button", { name: "Revoke" }));
    const confirm = await screen.findByRole("dialog", { name: 'Revoke "Billing software"?' });
    await userEvent.click(within(confirm).getByRole("button", { name: "Revoke" }));
    await waitFor(() => expect(calls.some((c) => c.path.endsWith("/k1/revoke"))).toBe(true));
  });

  it("adds a webhook endpoint, reveals its secret and sends a test event", async () => {
    const calls = mockApi(base([
      { method: "GET", path: "/api/portal/integrations/api-keys", body: [] },
      { method: "GET", path: "/api/portal/integrations/webhooks", body: [endpoint()] },
      { method: "GET", path: "/api/portal/integrations/deliveries", body: { count: 0, next: null, previous: null, results: [] } },
      { method: "POST", path: "/api/portal/integrations/webhooks", status: 201, body: endpoint({ id: "w2" }) },
      { method: "POST", path: "/api/portal/integrations/webhooks/w1/test", status: 202, body: delivery({ event_type: "test", status: "pending" }) },
    ]));
    renderWithQuery(<IntegrationsScreen />);
    const section = await screen.findByRole("region", { name: "Webhooks" });
    const card = await waitFor(() => {
      const found = section.querySelector("[data-endpoint]");
      expect(found).not.toBeNull();
      return found as HTMLElement;
    });
    expect(within(card).getByTestId("webhook-secret")).not.toHaveTextContent("supersecret");
    await userEvent.click(within(card).getByRole("button", { name: "Reveal" }));
    expect(within(card).getByTestId("webhook-secret")).toHaveTextContent("whsec_supersecret");
    expect(card).toHaveTextContent("Customer answer recorded");

    await userEvent.click(within(card).getByRole("button", { name: "Send test event" }));
    expect(await within(section).findByText("Test event sent. Its result appears in the delivery log.")).toBeInTheDocument();

    await userEvent.type(within(section).getByLabelText("Endpoint URL"), "ftp://nope");
    await userEvent.click(within(section).getByRole("button", { name: "Add endpoint" }));
    expect(await within(section).findByText("Enter a full URL starting with https://.")).toBeInTheDocument();
    await userEvent.clear(within(section).getByLabelText("Endpoint URL"));
    await userEvent.type(within(section).getByLabelText("Endpoint URL"), "https://erp.agency.test/v2");
    await userEvent.click(await within(section).findByRole("checkbox", { name: /Booking created/ }));
    await userEvent.click(within(section).getByRole("button", { name: "Add endpoint" }));
    await waitFor(() =>
      expect(calls.find((c) => c.method === "POST" && c.path.endsWith("/webhooks"))?.body).toEqual({
        url: "https://erp.agency.test/v2",
        events: ["outcome.recorded", "booking.created"],
      }),
    );
  });

  it("shows the delivery log with payloads and retries a failed delivery", async () => {
    const calls = mockApi(base([
      { method: "GET", path: "/api/portal/integrations/api-keys", body: [] },
      { method: "GET", path: "/api/portal/integrations/webhooks", body: [endpoint()] },
      {
        method: "GET", path: "/api/portal/integrations/deliveries",
        body: { count: 2, next: null, previous: null, results: [
          delivery(),
          delivery({ id: "d2", status: "failed", attempts: 9, last_status_code: 500, delivered_at: null }),
        ] },
      },
      { method: "POST", path: "/api/portal/integrations/deliveries/d2/retry", body: delivery({ id: "d2", status: "pending" }) },
    ]));
    renderWithQuery(<IntegrationsScreen />);
    const log = await screen.findByRole("region", { name: "Delivery log" });
    const failed = await waitFor(() => {
      const found = log.querySelector("tr[data-status=failed]");
      expect(found).not.toBeNull();
      return found as HTMLElement;
    });
    expect(failed).toHaveTextContent("HTTP 500");
    expect(failed).toHaveTextContent("9");
    await userEvent.click(within(log.querySelector("tr[data-status=succeeded]") as HTMLElement).getByRole("button", { name: "Payload" }));
    expect(within(log).getByText(/"booking_reference": "BK1"/)).toBeInTheDocument();
    await userEvent.click(within(failed).getByRole("button", { name: "Retry now" }));
    await waitFor(() => expect(calls.some((c) => c.path.endsWith("/d2/retry"))).toBe(true));
  });
});
