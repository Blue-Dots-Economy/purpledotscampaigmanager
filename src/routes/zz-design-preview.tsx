import { createFileRoute } from "@tanstack/react-router";
import { ParticipantDashboardBody, type ParticipantRollupData } from "@/components/my-dots/RealParticipantView";
import { summariseParticipantRows, type ParticipantRollupRow } from "@/lib/participant-rollup";
// TEMPORARY screenshot fixture — deleted after design comparison.
const names = ["Tech Mahindra Foundation","Samarthanam Trust","Enable India","Youth4Jobs","Sarthak Educational Trust","Saksham","Vision Empower","Mitra Jyothi","Anudip Foundation"];
const rows: ParticipantRollupRow[] = names.map((n, i) => ({ org_name: n, domain: "seeker", total: 9000 - i * 850, new_count: 400 - i * 30, active_count: 8600 - i * 820, at_risk_count: 0, inactive_count: 0, draft_count: 8700 - i * 830, live_count: 300 - i * 20, retired_count: 5 + i, avg_completion: 72 - i * 5, below_threshold: 1200 + i * 300 }));
const data = { ...summariseParticipantRows(rows, "seeker", null), source: "purple" as const, windowStart: "2026-10-01T00:00:00Z", windowEnd: "2026-10-29T00:00:00Z", loadedAt: "2026-10-29T00:00:00Z", latestLoadedAt: "2026-10-29T00:00:00Z", rpcRowCount: 9 } as unknown as ParticipantRollupData;
export const Route = createFileRoute("/zz-design-preview")({ component: () => <div className="p-6"><ParticipantDashboardBody data={data} domain="seeker" isFetching={false} onRefresh={() => {}} /></div> });
