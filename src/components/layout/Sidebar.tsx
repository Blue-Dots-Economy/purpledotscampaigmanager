import { useState } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import type { LucideIcon } from "lucide-react";
import {
  LayoutDashboard,
  Megaphone,
  Rocket,
  Settings,
  Briefcase,
  Headphones,
  Users,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useProgram } from "@/programs/context";
import { useAuth } from "@/auth/context";
import { canAccess } from "@/auth/permissions";
import { listConnections } from "@/lib/connections.functions";
import { cn } from "@/lib/utils";
import { registry } from "@/programs/registry";
import { BlueDotsMark } from "./BlueDotsMark";

type NavItem = {
  to: string;
  label: string;
  sub?: string;
  icon: LucideIcon;
  children?: Omit<NavItem, "sub" | "children">[];
};

const GROUPS: { title: string; items: NavItem[] }[] = [
  {
    title: "",
    items: [
      { to: "/user-level-analysis", label: "My Purple Dots", icon: Users },
      {
        to: "/",
        label: "Campaign Overview",
        icon: LayoutDashboard,
        children: [
          { to: "/campaigns", label: "Campaign Level Analysis", icon: Megaphone },
          { to: "/review", label: "Transcripts & Call Review", icon: Headphones },
        ],
      },
      { to: "/launch", label: "Launch a campaign", icon: Rocket },
      { to: "/ecosystem-view", label: "Ecosystem View", icon: Briefcase, sub: "Coming soon" },
    ],
  },
];

const SETTINGS = { to: "/settings", label: "Settings", icon: Settings } as const;

function NavLink({
  item,
  collapsed,
  onToggle,
}: {
  item: NavItem;
  collapsed?: boolean;
  onToggle?: () => void;
}) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const active = item.to === "/" ? pathname === "/" : pathname.startsWith(item.to);
  const hasChildren = (item.children?.length ?? 0) > 0;
  const groupActive =
    hasChildren &&
    item.children!.some((c) => (c.to === "/" ? pathname === "/" : pathname.startsWith(c.to)));

  return (
    <div>
      <div
        className={cn(
          "flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors",
          active || groupActive
            ? "bg-sidebar-accent text-sidebar-foreground"
            : "text-sidebar-foreground/85 hover:bg-sidebar-accent/70 hover:text-sidebar-foreground"
        )}
      >
        <Link
          to={item.to}
          className="flex items-center gap-3 flex-1"
          aria-current={active ? "page" : undefined}
        >
          <item.icon className="h-4 w-4 shrink-0" />
          <div className="flex flex-col">
            <span>{item.label}</span>
            {item.sub && (
              <span className="text-[11px] leading-tight opacity-70">{item.sub}</span>
            )}
          </div>
        </Link>
        {hasChildren && (
          <button
            type="button"
            onClick={onToggle}
            aria-label={collapsed ? "Expand section" : "Collapse section"}
            className="p-1 rounded-md hover:bg-sidebar-accent/70 text-sidebar-foreground/70"
          >
            {collapsed ? (
              <ChevronRight className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
          </button>
        )}
      </div>
      {hasChildren && !collapsed && (
        <div className="ml-4 mt-0.5 space-y-0.5 border-l border-sidebar-border pl-3">
          {item.children!.map((child) => {
            const childActive =
              child.to === "/" ? pathname === "/" : pathname.startsWith(child.to);
            const ChildIcon = child.icon;
            return (
              <Link
                key={child.to}
                to={child.to}
                aria-current={childActive ? "page" : undefined}
                className={cn(
                  "flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors",
                  childActive
                    ? "bg-sidebar-accent text-sidebar-foreground"
                    : "text-sidebar-foreground/85 hover:bg-sidebar-accent/70 hover:text-sidebar-foreground"
                )}
              >
                <ChildIcon className="h-4 w-4 shrink-0" />
                {child.label}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function Sidebar() {
  const { config, programId, setProgramId } = useProgram();
  const { session } = useAuth();
  const role = session?.role;
  const groups = GROUPS.map((g) => ({
    ...g,
    items: g.items
      .map((item) => ({
        ...item,
        children: item.children?.filter((c) => canAccess(role, c.to)),
      }))
      .filter(
        (item) => canAccess(role, item.to) || (item.children && item.children.length > 0),
      ),
  })).filter((g) => g.items.length > 0);
  const showSettings = canAccess(role, SETTINGS.to);
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  const listFn = useServerFn(listConnections);
  const { data: conns } = useQuery({
    queryKey: ["connections", programId],
    queryFn: () => listFn({ data: { program: programId } }),
  });
  const enabled = (conns ?? []).filter((c) => c.enabled);
  const allConnected = enabled.length > 0 && enabled.every((c) => c.status === "connected");

  const [expanded, setExpanded] = useState<Set<string>>(() => {
    const initial = new Set<string>();
    for (const group of GROUPS) {
      for (const item of group.items) {
        if (
          item.children?.some((c) =>
            c.to === "/" ? pathname === "/" : pathname.startsWith(c.to)
          )
        ) {
          initial.add(item.to);
        }
      }
    }
    return initial;
  });

  const toggle = (to: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(to)) next.delete(to);
      else next.add(to);
      return next;
    });
  };

  return (
    <aside style={{ backgroundImage: "var(--sidebar-gradient)" }} className="hidden min-h-screen w-64 shrink-0 overflow-hidden rounded-r-2xl bg-sidebar text-sidebar-foreground md:sticky md:top-0 md:flex md:h-screen md:flex-col">
      <div className="px-5 pt-6 pb-4">
        <BlueDotsMark />

        <div
          role="group"
          aria-label="Select program"
          className="mt-5 inline-flex rounded-lg bg-sidebar-accent p-1 w-full"
        >
          {(["seekers", "providers"] as const).map((id) => (
            <button
              key={id}
              onClick={() => setProgramId(id)}
              aria-pressed={programId === id}
              aria-label={`Show ${registry[id].label} program`}
              className={cn(
                "flex-1 text-xs font-medium py-1.5 rounded-md uppercase tracking-wide transition-colors",
                programId === id
                  ? "bg-white text-sidebar"
                  : "text-sidebar-foreground/80 hover:text-sidebar-foreground"
              )}
            >
              {registry[id].label}
            </button>
          ))}
        </div>
      </div>

      <nav className="flex-1 px-3 py-2 space-y-5 overflow-y-auto">
        {groups.map((group) => (
          <div key={group.title}>
            <div className="px-3 py-1.5 text-[11px] font-medium uppercase tracking-wider text-sidebar-foreground/60">
              {group.title}
            </div>
            <div className="space-y-0.5">
              {group.items.map((item) => (
                <NavLink
                  key={item.to}
                  item={item}
                  collapsed={!expanded.has(item.to)}
                  onToggle={() => toggle(item.to)}
                />
              ))}
            </div>
          </div>
        ))}
      </nav>

      {showSettings && (
        <div className="border-t border-sidebar-border px-3 py-2">
          {(() => {
            const item = SETTINGS;
            const active = pathname.startsWith(item.to);
            const Icon = item.icon;
            return (
              <Link
                to={item.to}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors",
                  active
                    ? "bg-sidebar-accent text-sidebar-foreground"
                    : "text-sidebar-foreground/85 hover:bg-sidebar-accent/70 hover:text-sidebar-foreground"
                )}
              >
                <Icon className="h-4 w-4 shrink-0" />
                {item.label}
              </Link>
            );
          })()}
        </div>
      )}

      <div className="mt-auto px-5 py-4 border-t border-sidebar-border text-[11px] opacity-85">
        <div>
          {enabled.length === 0 ? (
            <>
              No sheets connected · <Link to="/settings" className="underline">add one</Link>
            </>
          ) : (
            <>
              {enabled.length} sheet{enabled.length === 1 ? "" : "s"} ·{" "}
              <span className="inline-flex items-center gap-1">
                <span
                  className={cn(
                    "h-1.5 w-1.5 rounded-full",
                    allConnected ? "bg-emerald-300" : "bg-amber-300"
                  )}
                />
                {allConnected ? "connected" : "check status"}
              </span>
            </>
          )}
        </div>
      </div>
    </aside>
  );
}
