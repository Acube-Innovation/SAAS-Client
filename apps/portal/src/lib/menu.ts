/**
 * Portal screens and who may use them (portal spec Section 1 and the 1.1 matrix). The menu shows
 * exactly the screens a role can use; the API refuses the rest with 403.
 */

export type PortalRole = "owner" | "manager" | "office_staff" | "support";

export type Section = {
  href: string;
  key: string;
  roles: readonly PortalRole[];
};

const ALL: readonly PortalRole[] = ["owner", "manager", "office_staff", "support"];

export const SECTIONS: readonly Section[] = [
  { href: "/home", key: "home", roles: ALL },
  { href: "/subscribers", key: "subscribers", roles: ALL },
  { href: "/bookings", key: "bookings", roles: ALL },
  { href: "/deliveries", key: "deliveries", roles: ALL },
  { href: "/follow-up", key: "follow_up", roles: ALL },
  { href: "/reports", key: "reports", roles: ["owner", "manager", "support"] },
  { href: "/messages", key: "messages", roles: ALL },
  { href: "/areas", key: "areas", roles: ["owner", "manager", "support"] },
  { href: "/communication-log", key: "communication_log", roles: ALL },
  { href: "/wallet", key: "wallet", roles: ["owner", "manager", "support"] },
  { href: "/users", key: "users", roles: ["owner", "support"] },
  { href: "/reminder-settings", key: "reminder_settings", roles: ["owner", "manager", "support"] },
  { href: "/integrations", key: "integrations", roles: ["owner"] },
  { href: "/audit-log", key: "audit_log", roles: ["owner", "support"] },
];

export function menuFor(role: PortalRole | "" | undefined): Section[] {
  if (!role) return [];
  return SECTIONS.filter((section) => section.roles.includes(role));
}

export function sectionFor(pathname: string): Section | undefined {
  return SECTIONS.find((s) => pathname === s.href || pathname.startsWith(`${s.href}/`));
}

export function canOpen(role: PortalRole | "" | undefined, pathname: string): boolean {
  const section = sectionFor(pathname);
  return Boolean(role && section && section.roles.includes(role));
}
