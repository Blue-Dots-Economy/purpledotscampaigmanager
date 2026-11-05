import { Component, type ReactNode } from "react";
import { AlertTriangle, CircleDashed, MoonStar, Sparkles, Users } from "lucide-react";
import { useEngagementRollup } from "@/hooks/useEngagementRollup";
import type { ParticipantDomain } from "@/lib/participant-rollup";
import type { EngagementBuckets } from "@/lib/engagement-rollup";

const CARDS: { key: keyof EngagementBuckets; label: string; desc: string; Icon: typeof Users; num: string; card: string; tile: string }[] = [
  { key: "new", label: "New", desc: "Joined in the last 7 days, not yet engaged", Icon: Sparkles,
    num: "text-emerald-600 dark:text-emerald-400", card: "bg-emerald-500/[0.01] border-border", tile: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" },
  { key: "active", label: "Active", desc: "Engaged in the last 30 days", Icon: Users,
    num: "text-blue-600 dark:text-blue-400", card: "bg-blue-500/[0.01] border-border", tile: "bg-blue-500/15 text-blue-600 dark:text-blue-400" },
  { key: "atRisk", label: "At Risk", desc: "Last engaged 31–90 days ago", Icon: AlertTriangle,
    num: "text-amber-600 dark:text-amber-400", card: "bg-amber-500/[0.01] border-border", tile: "bg-amber-500/15 text-amber-600 dark:text-amber-400" },
  { key: "dormant", label: "Dormant", desc: "Last engaged over 90 days ago", Icon: MoonStar,
    num: "text-rose-600 dark:text-rose-400", card: "bg-rose-500/[0.01] border-border", tile: "bg-rose-500/15 text-rose-600 dark:text-rose-400" },
  { key: "never", label: "Never engaged", desc: "Joined over 7 days ago, never engaged", Icon: CircleDashed,
    num: "text-foreground", card: "bg-muted/20 border-border", tile: "bg-muted text-muted-foreground" },
];

const fmt = (v: string) => new Date(v).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

export class EngagementErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state: { error: Error | null } = { error: null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  render() {
    if (!this.state.error) return this.props.children;
    return <p role="alert" className="text-sm text-destructive">Engagement figures could not be loaded: {this.state.error.message}</p>;
  }
}

export function EngagementCards({ actor, domain }: { actor: string; domain: ParticipantDomain }) {
  const { data } = useEngagementRollup(actor, domain);
  const range = data.firstEvent && data.asOf ? `${fmt(data.firstEvent)} to ${fmt(data.asOf)}` : "an unknown period";
  return <div>
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
      {CARDS.map(({ key, label, desc, Icon, num, card, tile }) => (
        <div key={key} className={`rounded-xl border p-5 ${card}`}>
          <div className={`h-9 w-9 rounded-lg flex items-center justify-center ${tile}`}><Icon className="h-4 w-4" /></div>
          <div className={`mt-4 text-5xl font-bold tracking-tight tabular-nums ${num}`}>{data[key].toLocaleString()}</div>
          <div className="mt-2 text-base font-semibold text-foreground">{label}</div>
          <div className="mt-0.5 text-sm text-muted-foreground">{desc}</div>
        </div>
      ))}
    </div>
    <p className="mt-3 text-sm text-muted-foreground">
      Engagement measured from connection requests and connections, {range}; windows count back from the latest event, not today. {data.engagedUsers.toLocaleString()} people have engaged across {data.total.toLocaleString()} profiles. At Risk and Dormant require 90 days of history and will stay at zero until the programme is older.
    </p>
  </div>;
}
