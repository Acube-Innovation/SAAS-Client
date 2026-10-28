import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render } from "@testing-library/react";
import { vi } from "vitest";

export const router = { replace: vi.fn(), push: vi.fn(), refresh: vi.fn(), back: vi.fn(), prefetch: vi.fn() };
export const navigation = { pathname: "/home", search: new URLSearchParams() };

export function renderWithQuery(ui: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

type Handler = {
  method: string;
  path: string;
  status?: number;
  body?: unknown;
  /** A non-JSON body (e.g. CSV) with its headers. */
  raw?: { text: string; headers: Record<string, string> };
};

/** Replace fetch with canned API responses; returns the list of requests made. */
export function mockApi(handlers: Handler[]) {
  const calls: { method: string; path: string; search: string; body: unknown }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: Request | string, init?: RequestInit) => {
      const request = typeof input === "string" ? new Request(new URL(input, "http://localhost:3000"), init) : input;
      const url = new URL(request.url);
      const text = request.method === "GET" ? "" : await request.text();
      let body: unknown = undefined;
      if (text) {
        try {
          body = JSON.parse(text);
        } catch {
          body = text; // e.g. multipart form data
        }
      }
      calls.push({ method: request.method, path: url.pathname, search: url.search, body });
      const handler = handlers.find((h) => h.method === request.method && h.path === url.pathname);
      const status = handler?.status ?? (handler ? 200 : 404);
      if (handler?.raw) return new Response(handler.raw.text, { status, headers: handler.raw.headers });
      return new Response(handler?.body === undefined ? null : JSON.stringify(handler.body), {
        status,
        headers: { "Content-Type": "application/json" },
      });
    }),
  );
  return calls;
}

export function authState(overrides: Record<string, unknown> = {}) {
  return {
    id: "u1",
    email: "manager@agency.test",
    full_name: "Mini Manager",
    platform_role: "",
    requires_2fa: false,
    otp_device_confirmed: false,
    otp_verified: false,
    otp_required: false,
    otp_setup_required: false,
    active_tenant_id: "t1",
    memberships: [
      { id: "m1", tenant_id: "t1", tenant_name: "Kochi Gas Agency", tenant_status: "active", role: "manager", status: "active" },
    ],
    ...overrides,
  };
}

export function portalConfig(overrides: Record<string, unknown> = {}) {
  return {
    tenant_id: "t1",
    tenant_name: "Kochi Gas Agency",
    tenant_status: "active",
    suspended_at: null,
    suspension_reason: "",
    role: "manager",
    default_language: "ml",
    template: "gas_agency",
    subscriber_fields: [
      { key: "customer_name", label: "Customer name", field_type: "text", required: true, is_core: true },
      { key: "external_ref", label: "Consumer number", field_type: "text", required: true, is_core: true },
    ],
    schedule_types: [
      { key: "cylinder_delivery", name: "Cylinder delivery", fields: [{ key: "scheduled_date", label: "Planned delivery date" }] },
    ],
    ...overrides,
  };
}
