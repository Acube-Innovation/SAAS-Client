/** Small inline icons (24x24, stroke). */
const base = {
  width: 20,
  height: 20,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
};

export const icons = {
  home: (
    <svg {...base}>
      <path d="M3 10.5 12 3l9 7.5" />
      <path d="M5 9.5V21h14V9.5" />
      <path d="M10 21v-6h4v6" />
    </svg>
  ),
  people: (
    <svg {...base}>
      <circle cx="9" cy="8" r="3.5" />
      <path d="M2.5 20a6.5 6.5 0 0 1 13 0" />
      <path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 14a6 6 0 0 1 3.5 6" />
    </svg>
  ),
  calendar: (
    <svg {...base}>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M3 10h18M8 3v4M16 3v4" />
    </svg>
  ),
  truck: (
    <svg {...base}>
      <path d="M2 6h11v10H2zM13 10h4l4 4v2h-8" />
      <circle cx="6" cy="18" r="2" />
      <circle cx="17" cy="18" r="2" />
    </svg>
  ),
  inbox: (
    <svg {...base}>
      <path d="M3 13h5l1.5 3h5L16 13h5" />
      <path d="M5 5h14l2 8v6H3v-6z" />
    </svg>
  ),
  chart: (
    <svg {...base}>
      <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />
    </svg>
  ),
  map: (
    <svg {...base}>
      <path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2z" />
      <path d="M9 4v14M15 6v14" />
    </svg>
  ),
  phone: (
    <svg {...base}>
      <path d="M5 3h4l2 5-2.5 1.5a11 11 0 0 0 6 6L16 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 5a2 2 0 0 1 2-2" />
    </svg>
  ),
  wallet: (
    <svg {...base}>
      <rect x="3" y="6" width="18" height="14" rx="2" />
      <path d="M3 10h18M16 15h2" />
    </svg>
  ),
  bell: (
    <svg {...base}>
      <path d="M6 9a6 6 0 0 1 12 0c0 6 3 7 3 7H3s3-1 3-7" />
      <path d="M10 20a2 2 0 0 0 4 0" />
    </svg>
  ),
  plug: (
    <svg {...base}>
      <path d="M9 3v5M15 3v5M6 8h12v3a6 6 0 0 1-12 0zM12 17v4" />
    </svg>
  ),
  dashboard: (
    <svg {...base}>
      <rect x="3" y="3" width="7" height="9" rx="1.5" />
      <rect x="14" y="3" width="7" height="5" rx="1.5" />
      <rect x="14" y="12" width="7" height="9" rx="1.5" />
      <rect x="3" y="16" width="7" height="5" rx="1.5" />
    </svg>
  ),
  clients: (
    <svg {...base}>
      <path d="M3 21V7l9-4 9 4v14" />
      <path d="M9 21v-6h6v6" />
      <path d="M8 10h.01M12 10h.01M16 10h.01" />
    </svg>
  ),
  industry: (
    <svg {...base}>
      <path d="M4 6h16M4 12h16M4 18h10" />
      <circle cx="19" cy="18" r="2" />
    </svg>
  ),
  whatsapp: (
    <svg {...base}>
      <path d="M21 12a9 9 0 0 1-13.5 7.8L3 21l1.2-4.5A9 9 0 1 1 21 12Z" />
      <path d="M9 10h6M9 14h4" />
    </svg>
  ),
  audit: (
    <svg {...base}>
      <path d="M9 4h6l1 2h3v15H5V6h3l1-2Z" />
      <path d="M9 12l2 2 4-4" />
    </svg>
  ),
  menu: (
    <svg {...base}>
      <path d="M4 7h16M4 12h16M4 17h16" />
    </svg>
  ),
  close: (
    <svg {...base}>
      <path d="M6 6l12 12M18 6 6 18" />
    </svg>
  ),
  signOut: (
    <svg {...base}>
      <path d="M15 4h4v16h-4M10 8l-4 4 4 4M6 12h10" />
    </svg>
  ),
};
