/* Line icons for the Control Room (16px grid, 1.6 stroke, currentColor). */
import type { ReactNode } from "react";

const I = ({ children }: { children: ReactNode }) => (
  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {children}
  </svg>
);

export const Icons = {
  pulse: (
    <I>
      <path d="M1.5 8.5h3l1.8-4 3.2 8 1.8-4h3.2" />
    </I>
  ),
  overview: (
    <I>
      <rect x="2" y="2" width="5" height="5" rx="1.2" />
      <rect x="9" y="2" width="5" height="5" rx="1.2" />
      <rect x="2" y="9" width="5" height="5" rx="1.2" />
      <rect x="9" y="9" width="5" height="5" rx="1.2" />
    </I>
  ),
  growth: (
    <I>
      <path d="M2 12.5 6 8.5l2.5 2.5L14 5.5" />
      <path d="M10 5.5h4v4" />
    </I>
  ),
  wall: (
    <I>
      <rect x="2" y="2.5" width="3" height="11" rx="0.8" />
      <rect x="6.5" y="2.5" width="3" height="11" rx="0.8" />
      <rect x="11" y="2.5" width="3" height="11" rx="0.8" />
    </I>
  ),
  creators: (
    <I>
      <circle cx="8" cy="5.5" r="2.6" />
      <path d="M2.8 13.8c.8-2.6 2.8-3.9 5.2-3.9s4.4 1.3 5.2 3.9" />
    </I>
  ),
  revenue: (
    <I>
      <path d="M8 1.8v12.4" />
      <path d="M11.2 4.6c-.6-1-1.8-1.6-3.2-1.6-1.8 0-3 .9-3 2.3 0 3.4 6.4 1.6 6.4 5 0 1.4-1.3 2.4-3.3 2.4-1.5 0-2.8-.6-3.4-1.7" />
    </I>
  ),
  acquisition: (
    <I>
      <circle cx="8" cy="8" r="6" />
      <path d="M2 8h12M8 2c1.8 1.7 2.6 3.7 2.6 6S9.8 12.3 8 14c-1.8-1.7-2.6-3.7-2.6-6S6.2 3.7 8 2Z" />
    </I>
  ),
  shares: (
    <I>
      <circle cx="12" cy="3.8" r="1.8" />
      <circle cx="4" cy="8" r="1.8" />
      <circle cx="12" cy="12.2" r="1.8" />
      <path d="m5.6 7.1 4.8-2.4M5.6 8.9l4.8 2.4" />
    </I>
  ),
  retention: (
    <I>
      <path d="M13 8a5 5 0 1 1-1.5-3.6" />
      <path d="M13.2 2.2v3h-3" />
    </I>
  ),
  operations: (
    <I>
      <rect x="2" y="2.5" width="12" height="4.5" rx="1.2" />
      <rect x="2" y="9" width="12" height="4.5" rx="1.2" />
      <path d="M4.5 4.75h.01M4.5 11.25h.01" strokeWidth="2.2" />
    </I>
  ),
  events: (
    <I>
      <path d="M2 4h12M2 8h8M2 12h10" />
    </I>
  ),
  exports: (
    <I>
      <path d="M8 2v8M4.8 6.8 8 10l3.2-3.2" />
      <path d="M2.5 11v1.5c0 .8.7 1.5 1.5 1.5h8c.8 0 1.5-.7 1.5-1.5V11" />
    </I>
  ),
  arrow: (
    <I>
      <path d="M3.5 8h9M9 4.5 12.5 8 9 11.5" />
    </I>
  ),
  up: (
    <I>
      <path d="M8 12.5v-9M4.5 7 8 3.5 11.5 7" />
    </I>
  ),
  down: (
    <I>
      <path d="M8 3.5v9M4.5 9 8 12.5 11.5 9" />
    </I>
  ),
  alert: (
    <I>
      <path d="M8 2 1.8 13h12.4L8 2Z" />
      <path d="M8 6.5v3M8 11.3v.01" />
    </I>
  ),
  info: (
    <I>
      <circle cx="8" cy="8" r="6" />
      <path d="M8 7.3V11M8 5v.01" />
    </I>
  ),
  check: (
    <I>
      <circle cx="8" cy="8" r="6" />
      <path d="m5.5 8.2 1.7 1.7 3.4-3.6" />
    </I>
  ),
  x: (
    <I>
      <circle cx="8" cy="8" r="6" />
      <path d="m6 6 4 4M10 6l-4 4" />
    </I>
  ),
  open: (
    <I>
      <path d="M1.5 8S4 3.5 8 3.5 14.5 8 14.5 8 12 12.5 8 12.5 1.5 8 1.5 8Z" />
      <circle cx="8" cy="8" r="2" />
    </I>
  ),
  save: (
    <I>
      <path d="M4 2.5h8v11L8 10.5l-4 3v-11Z" />
    </I>
  ),
  link: (
    <I>
      <path d="M6.5 9.5 9.5 6.5M7 4.5l1-1a2.8 2.8 0 0 1 4 4l-1 1M9 11.5l-1 1a2.8 2.8 0 0 1-4-4l1-1" />
    </I>
  ),
  visit: (
    <I>
      <path d="M2.5 8h7M7 5l3 3-3 3" />
      <path d="M10.5 2.5h2a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1h-2" />
    </I>
  ),
  create: (
    <I>
      <path d="M8 3v10M3 8h10" />
    </I>
  ),
  card: (
    <I>
      <rect x="1.8" y="3.5" width="12.4" height="9" rx="1.5" />
      <path d="M1.8 6.5h12.4" />
    </I>
  ),
  sun: (
    <I>
      <circle cx="8" cy="8" r="2.8" />
      <path d="M8 1.5v1.3M8 13.2v1.3M1.5 8h1.3M13.2 8h1.3M3.4 3.4l.9.9M11.7 11.7l.9.9M3.4 12.6l.9-.9M11.7 4.3l.9-.9" />
    </I>
  ),
  moon: (
    <I>
      <path d="M13.2 9.8A5.6 5.6 0 0 1 6.2 2.8a5.6 5.6 0 1 0 7 7Z" />
    </I>
  ),
  out: (
    <I>
      <path d="M6 2.5H3.5a1 1 0 0 0-1 1v9a1 1 0 0 0 1 1H6M10 5l3 3-3 3M13 8H6" />
    </I>
  ),
};
export type IconName = keyof typeof Icons;
