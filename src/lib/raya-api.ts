const BASE_URL = "https://v1.getraya.app/api";

export class RayaApiError extends Error {
  status: number;
  body: unknown;

  constructor(status: number, body: unknown, message: string) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

export const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export const AGENT_PAGE_CAP = 50;
export const AGENT_COUNT_CAP = 2_000;
export interface RayaAgentOption { id: string; name: string }

export async function fetchAllRayaAgents(
  request: (path: string) => Promise<unknown>,
  pageSize = 100,
): Promise<RayaAgentOption[]> {
  const limit = Math.min(100, Math.max(1, Math.floor(pageSize) || 100));
  const agents = new Map<string, RayaAgentOption>();
  let offset = 0;
  for (let page = 0; page < AGENT_PAGE_CAP && offset < AGENT_COUNT_CAP; page += 1) {
    const requestedLimit = Math.min(limit, AGENT_COUNT_CAP - offset);
    const raw = await request(`/agent?offset=${offset}&limit=${requestedLimit}`);
    if (!raw || typeof raw !== "object" || !Array.isArray((raw as Record<string, unknown>).agents)) {
      throw new Error("Raya returned an invalid agent list");
    }
    const response = raw as { agents: Record<string, unknown>[]; total?: unknown; offset?: unknown; limit?: unknown };
    for (const agent of response.agents) {
      const id = String(agent.id ?? agent.agent_id ?? agent._id ?? "").trim();
      if (!id) continue;
      const name = String(agent.name ?? agent.agent_name ?? agent.title ?? id).trim() || id;
      if (agents.size < AGENT_COUNT_CAP) agents.set(id, { id, name });
    }
    const total = Number(response.total);
    const responseOffset = Number(response.offset ?? offset);
    const responseLimit = Number(response.limit ?? response.agents.length);
    if (!Number.isFinite(total) || total < 0 || responseOffset !== offset || !Number.isFinite(responseLimit) || responseLimit <= 0) {
      throw new Error("Raya returned invalid agent pagination");
    }
    const nextOffset = offset + Math.min(responseLimit, requestedLimit);
    if (nextOffset >= total) return [...agents.values()];
    if (!response.agents.length) throw new Error("Raya agent pagination ended before its total");
    offset = nextOffset;
  }
  console.warn("[raya] Agent enumeration capped", { pages: AGENT_PAGE_CAP, maxAgents: AGENT_COUNT_CAP, returned: agents.size });
  return [...agents.values()];
}

function retryAfterMs(header: string | null): number | null {
  if (!header) return null;
  const seconds = Number(header);
  if (Number.isFinite(seconds) && seconds > 0) return seconds * 1000;
  const dateMs = Date.parse(header);
  if (Number.isFinite(dateMs)) return Math.max(0, dateMs - Date.now());
  return null;
}

function parseBody(text: string): unknown {
  try {
    return text ? JSON.parse(text) : null;
  } catch {
    return text;
  }
}

function errorMessage(status: number, parsed: unknown): string {
  if (status === 401) return "Raya rejected the API key (401). Check RAYA_API_KEY.";
  if (status === 429) return "Raya rate limit hit (429). Retried several times but Raya is still throttling requests.";
  if (parsed && typeof parsed === "object") {
    const p = parsed as Record<string, any>;
    const m =
      (typeof p.message === "string" && p.message) ||
      (typeof p.error === "string" && p.error) ||
      (typeof p.detail === "string" && p.detail) ||
      null;
    if (m) return `Raya API ${status}: ${m}`;
    try {
      return `Raya API ${status}: ${JSON.stringify(parsed).slice(0, 600)}`;
    } catch {
      /* ignore */
    }
  }
  if (typeof parsed === "string" && parsed.trim()) return `Raya API ${status}: ${parsed.slice(0, 600)}`;
  return `Raya API ${status}`;
}

export async function rayaFetch(
  path: string,
  init: RequestInit & { json?: unknown } = {},
  options: { maxAttempts?: number; baseDelayMs?: number } = {},
): Promise<unknown> {
  const apiKey = process.env.RAYA_API_KEY;
  if (!apiKey) {
    throw new Error("RAYA_API_KEY is not set. Add it in Project Settings → Secrets, then try again.");
  }

  const headers: Record<string, string> = {
    "X-API-Key": apiKey,
    Accept: "application/json",
    ...(init.headers as Record<string, string> | undefined),
  };
  let body = init.body;
  if (init.json !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(init.json);
  }

  const maxAttempts = options.maxAttempts ?? 4;
  const baseDelayMs = options.baseDelayMs ?? 2_000;
  let res!: Response;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    res = await fetch(`${BASE_URL}${path}`, { ...init, headers, body });
    if (res.status !== 429 || attempt === maxAttempts - 1) break;

    const waitMs = retryAfterMs(res.headers.get("retry-after"))
      ?? Math.min(12_000, baseDelayMs * 2 ** attempt) + Math.floor(Math.random() * 250);
    console.warn(`[raya] 429 on ${path}, retrying in ${waitMs}ms (attempt ${attempt + 1}/${maxAttempts})`);
    await delay(waitMs);
  }

  const parsed = parseBody(await res.text());
  if (!res.ok) {
    console.error("[raya] non-OK response", { path, status: res.status, body: parsed });
    throw new RayaApiError(res.status, parsed, errorMessage(res.status, parsed));
  }

  return parsed;
}