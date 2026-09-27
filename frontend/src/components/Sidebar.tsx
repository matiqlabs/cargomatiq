"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import appLogo from "@/assets/app-logo.png";
import cargomaticIcon from "@/assets/cargomatic-icon.png";

type Props = { collapsed: boolean; onToggle: () => void };

const OPERATIONS_NAV = [
  {
    href: "/",
    label: "Operations",
    exact: true,
    icon: (
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="7" height="7" rx="1.2" /><rect x="14" y="3" width="7" height="7" rx="1.2" />
        <rect x="14" y="14" width="7" height="7" rx="1.2" /><rect x="3" y="14" width="7" height="7" rx="1.2" />
      </svg>
    ),
  },
  {
    href: "/inbox",
    label: "Inbox",
    exact: true,
    icon: (
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 2L2 7l10 5 10-5-10-5z" /><path d="M2 17l10 5 10-5" /><path d="M2 12l10 5 10-5" />
      </svg>
    ),
  },
  {
    href: "/shipments",
    label: "Shipments",
    exact: false,
    icon: (
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <ellipse cx="12" cy="5" rx="9" ry="3" /><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3" />
        <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" />
      </svg>
    ),
  },
  {
    href: "/operations/exceptions",
    label: "Exceptions",
    exact: false,
    icon: (
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="3" width="20" height="14" rx="2" /><path d="M8 21h8M12 17v4" />
      </svg>
    ),
  },
  {
    href: "/tasks",
    label: "Tasks",
    exact: false,
    icon: (
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 4h16v5H4z" /><path d="M4 15h16v5H4z" /><path d="M8 9v6" /><path d="M16 9v6" />
      </svg>
    ),
  },
];

const FINANCE_NAV = [
  {
    href: "/jobs",
    label: "Reconciliation",
    exact: false,
    icon: (
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" />
        <path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />
      </svg>
    ),
  },
  {
    href: "/jobs/new",
    label: "New Reconciliation",
    exact: true,
    icon: (
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="9" /><path d="M12 8v8M8 12h8" />
      </svg>
    ),
  },
  {
    href: "/history",
    label: "Reconciliation History",
    exact: false,
    icon: (
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 12a9 9 0 1 0 3-6.7" /><path d="M3 3v6h6M12 7v5l3 2" />
      </svg>
    ),
  },
  {
    href: "/exceptions",
    label: "Finance Exceptions",
    exact: false,
    icon: (
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 9v4M12 17h.01" /><circle cx="12" cy="12" r="9" />
      </svg>
    ),
  },
  {
    href: "/reports",
    label: "Finance Reports",
    exact: false,
    icon: (
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 8v4l3 3" /><circle cx="12" cy="12" r="9" />
      </svg>
    ),
  },
];

const SETTINGS_NAV = [
  {
    href: "/snapshots",
    label: "Finance Data Uploads",
    exact: false,
    icon: (
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <line x1="18" y1="20" x2="18" y2="10" /><line x1="12" y1="20" x2="12" y2="4" />
        <line x1="6" y1="20" x2="6" y2="14" /><line x1="2" y1="20" x2="22" y2="20" />
      </svg>
    ),
  },
  {
    href: "/master",
    label: "Master Data",
    exact: false,
    icon: (
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <rect x="4" y="3" width="16" height="18" rx="2" /><path d="M8 7h8M8 11h8M8 15h5" />
      </svg>
    ),
  },
];

export default function Sidebar({ collapsed, onToggle }: Props) {
  const path = usePathname();

  function isActive(href: string, exact: boolean) {
    if (exact) return path === href;
    if (href === "/jobs") return path === "/jobs" || (path?.startsWith("/jobs/") && !path.startsWith("/jobs/new"));
    return path?.startsWith(href);
  }

  const sections = [
    { label: "Operations", items: OPERATIONS_NAV },
    { label: "Finance", items: FINANCE_NAV },
    { label: "Settings", items: SETTINGS_NAV },
  ];

  return (
    <aside
      className="sidebar-shell fixed top-0 left-0 h-screen flex flex-col z-40 select-none overflow-hidden transition-all duration-300 ease-in-out"
      style={{ width: collapsed ? 76 : 264 }}
    >
      {/* Brand */}
      <div className="flex items-center px-4 border-b border-white/[0.06]" style={{ height: 72, minHeight: 72 }}>
        <Link
          href="/"
          title="Dashboard"
          aria-label="Go to dashboard"
          className={`relative h-9 overflow-hidden ${
            collapsed ? "w-9" : "w-[172px]"
          }`}
        >
          <img
            src={cargomaticIcon.src}
            alt="Cargomatiq"
            className={`absolute left-0 top-0 w-9 h-9 rounded-xl object-contain transition-all duration-300 ease-in-out ${
              collapsed ? "opacity-100 scale-100 translate-x-0 delay-100" : "opacity-0 scale-90 translate-x-2 pointer-events-none"
            }`}
          />
          <img
            src={appLogo.src}
            alt="Cargomatiq"
            className={`absolute left-0 top-1/2 h-8 w-auto max-w-[172px] -translate-y-1/2 object-contain transition-all duration-300 ease-in-out ${
              collapsed ? "opacity-0 scale-95 -translate-x-2 pointer-events-none" : "opacity-100 scale-100 translate-x-0 duration-0"
            }`}
          />
        </Link>
        {/* Collapse toggle — shown when expanded, floats right */}
        {!collapsed && (
          <button
            onClick={onToggle}
            className="ml-auto flex-shrink-0 w-6 h-6 rounded-lg flex items-center justify-center text-[#475569] hover:text-[#94A3B8] hover:bg-white/[0.06] transition-colors"
            aria-label="Collapse sidebar"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M15 18l-6-6 6-6" />
            </svg>
          </button>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 py-4 overflow-y-auto overflow-x-hidden" style={{ padding: collapsed ? "16px 10px" : "16px 12px" }}>
        <div className="space-y-4">
          {sections.map((section) => (
            <div key={section.label} className="space-y-0.5">
              {!collapsed && (
                <div className="text-[9.5px] font-bold uppercase tracking-[0.12em] text-[#2D3F54] px-2 mb-2">
                  {section.label}
                </div>
              )}
              {section.items.map((item) => {
            const active = isActive(item.href, item.exact);
            return (
              <Link
                key={item.href}
                href={item.href}
                title={collapsed ? item.label : undefined}
                className={`flex items-center rounded-xl transition-all duration-150 relative group ${
                  collapsed ? "justify-center w-full h-10" : "gap-3 px-3 py-2.5"
                } ${
                  active
                    ? "text-white"
                    : "text-[#5B7A96] hover:text-[#94A3B8] hover:bg-white/[0.04]"
                }`}
                style={active ? { background: "rgba(255,255,255,0.08)" } : undefined}
              >
                {/* Active left rail */}
                {active && !collapsed && (
                  <span
                    className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-[22px] rounded-r-full"
                    style={{ background: "#22D3EE" }}
                  />
                )}
                {/* Active glow dot when collapsed */}
                {active && collapsed && (
                  <span
                    className="absolute -right-0.5 top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-cyan-400"
                  />
                )}
                <span
                  className="flex-shrink-0"
                  style={active ? { color: "#22D3EE" } : undefined}
                >
                  {item.icon}
                </span>
                {!collapsed && (
                  <span className="text-[13px] font-medium whitespace-nowrap">{item.label}</span>
                )}
              </Link>
            );
              })}
            </div>
          ))}
        </div>
        {collapsed && (
          <button
            onClick={onToggle}
            className="mt-2 mx-auto w-full h-10 rounded-xl flex items-center justify-center text-[#475569] hover:text-[#94A3B8] hover:bg-white/[0.06] transition-colors"
            aria-label="Expand sidebar"
            title="Expand sidebar"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 18l6-6-6-6" />
            </svg>
          </button>
        )}
      </nav>

      {/* Footer */}
      <div
        className="border-t border-white/[0.06] flex items-center"
        style={{ padding: collapsed ? "14px 0" : "14px 20px", justifyContent: collapsed ? "center" : "flex-start" }}
      >
        {collapsed ? (
          <div
            className="w-2 h-2 rounded-full bg-emerald-400"
            title="Demo Environment · Active"
          />
        ) : (
          <div>
            <div className="text-[9.5px] font-bold uppercase tracking-[0.12em] text-[#2D3F54] mb-1.5">Workspace</div>
            <div className="flex items-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 flex-shrink-0" />
              <span className="text-[#4B6280] text-[11px]">Demo Environment</span>
              <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full bg-slate-700 text-slate-300">
                Active
              </span>
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}
