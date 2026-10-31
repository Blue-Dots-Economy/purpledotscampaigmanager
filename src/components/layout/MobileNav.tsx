import { useState } from "react";
import { Link, useRouterState, useNavigate } from "@tanstack/react-router";
import type { LucideIcon } from "lucide-react";
import {
  LayoutDashboard,
  Megaphone,
  Rocket,
  Settings,
  Briefcase,
  Headphones,
  Users,
  Menu,
  LogOut,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { useProgram } from "@/programs/context";
import { useAuth } from "@/auth/context";
import { canAccess } from "@/auth/permissions";
import { cn } from "@/lib/utils";
import { registry } from "@/programs/registry";

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
  onNavigate,
}: {
  item: NavItem;
  collapsed?: boolean;
  onToggle?: () => void;
  onNavigate?: () => void;
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
            ? "bg-accent text-accent-foreground"
            : "text-foreground/85 hover:bg-accent/70"
        )}
      >
        <Link
          to={item.to}
          onClick={onNavigate}
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
            className="p-1 rounded-md hover:bg-accent/70 text-accent-foreground/70"
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
        <div className="ml-4 mt-0.5 space-y-0.5 border-l border-border pl-3">
          {item.children!.map((child) => {
            const childActive =
              child.to === "/" ? pathname === "/" : pathname.startsWith(child.to);
            const ChildIcon = child.icon;
            return (
              <Link
                key={child.to}
                to={child.to}
                onClick={onNavigate}
                aria-current={childActive ? "page" : undefined}
                className={cn(
                  "flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors",
                  childActive
                    ? "bg-accent text-accent-foreground"
                    : "text-foreground/85 hover:bg-accent/70"
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

export function MobileNav() {
  const [open, setOpen] = useState(false);
  const { programId, setProgramId } = useProgram();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const navigate = useNavigate();
  const { logout, session } = useAuth();
  // Keep the trimmed oversight menu; Network Administrators also have launch access.
  const isEcosystem = session?.role === "ecosystem" || session?.role === "network_admin";
  const groups = isEcosystem
    ? [{
        title: "",
        items: [
          GROUPS[0].items[3],
          GROUPS[0].items[0],
          { to: "/", label: "Campaign Overview", icon: LayoutDashboard },
          ...(session?.role === "network_admin" ? [GROUPS[0].items[2]] : []),
        ] as NavItem[],
      }]
    : session?.role === "owner"
      ? GROUPS.map((group) => ({
          ...group,
          items: group.items
            .filter((item) => canAccess("owner", item.to))
            .map((item) => ({
              ...item,
              children: item.children?.filter((child) => canAccess("owner", child.to)),
            })),
        }))
      : GROUPS;

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
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Open menu" className="md:hidden">
          <Menu className="h-5 w-5" />
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-72 p-0 flex flex-col">
        <SheetHeader className="px-5 pt-5 pb-3">
          <SheetTitle className="sr-only">Menu</SheetTitle>
        </SheetHeader>

        <div className="px-5 pb-4">
          <div
            role="group"
            aria-label="Select program"
            className="inline-flex rounded-lg bg-muted p-1 w-full"
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
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {registry[id].label}
              </button>
            ))}
          </div>
        </div>

        <nav className="flex-1 px-3 py-1 space-y-5 overflow-y-auto">
          {groups.map((group) => (
            <div key={group.title}>
              <div className="px-3 py-1.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                {group.title}
              </div>
              <div className="space-y-0.5">
                {group.items.map((item) => (
                  <NavLink
                    key={item.to}
                    item={item}
                    collapsed={!expanded.has(item.to)}
                    onToggle={() => toggle(item.to)}
                    onNavigate={() => setOpen(false)}
                  />
                ))}
              </div>
            </div>
          ))}
        </nav>

        {!isEcosystem && session?.role !== "owner" && (
          <div className="border-t px-3 py-2">
            {(() => {
              const item = SETTINGS;
              const active = pathname.startsWith(item.to);
              const Icon = item.icon;
              return (
                <Link
                  to={item.to}
                  aria-current={active ? "page" : undefined}
                  onClick={() => setOpen(false)}
                  className={cn(
                    "flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors",
                    active
                      ? "bg-accent text-accent-foreground"
                      : "text-foreground/85 hover:bg-accent/70"
                  )}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  {item.label}
                </Link>
              );
            })()}
          </div>
        )}

        <div className="mt-auto border-t px-5 py-4">
          <button
            onClick={() => {
              setOpen(false);
              logout();
              navigate({ to: "/login" });
            }}
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <LogOut className="h-4 w-4" />
            Sign out
          </button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
