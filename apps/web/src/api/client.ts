import type {
  SessionFilter,
  EventFilter,
  RunFilter,
  SessionSummary,
  AgentWatchEvent,
  RunListResult,
  RunDetail,
  RunComparisonResult,
  RunDurationTrends,
  ProjectSummary,
  PanelQuery,
  PanelResult,
} from "@agentwatch/types";

const BASE_URL = import.meta.env.VITE_API_URL ?? "";

function buildQuery(
  params: Record<string, string | number | string[] | undefined>,
): string {
  const searchParams = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value == null) continue;
    if (Array.isArray(value)) {
      if (value.length > 0) {
        searchParams.set(key, value.join(","));
      }
    } else {
      searchParams.set(key, String(value));
    }
  }
  const qs = searchParams.toString();
  return qs ? `?${qs}` : "";
}

async function fetchJson<T>(path: string, fallback: T): Promise<T> {
  try {
    const res = await fetch(`${BASE_URL}${path}`);
    if (!res.ok) {
      console.warn(`API ${path}: ${res.status} ${res.statusText}`);
      return fallback;
    }
    return (await res.json()) as T;
  } catch (err) {
    console.warn(`API ${path}: fetch failed`, err);
    return fallback;
  }
}

export function getSessions(
  filter: SessionFilter = {},
): Promise<SessionSummary[]> {
  return fetchJson(`/api/sessions${buildQuery({ ...filter })}`, []);
}

export function getEvents(
  filter: EventFilter = {},
): Promise<AgentWatchEvent[]> {
  const { type, level, ...rest } = filter;
  const params: Record<string, string | number | string[] | undefined> = {
    ...rest,
  };
  if (type != null) params.type = type;
  if (level != null) params.level = level;
  return fetchJson(`/api/events${buildQuery(params)}`, []);
}

export function getRuns(filter: RunFilter = {}): Promise<RunListResult> {
  return fetchJson(`/api/runs${buildQuery({ ...filter })}`, {
    rows: [],
    total: 0,
  });
}

export function getRunDurationTrends(
  pipelineDefinitionIds: string[],
  limit = 10,
): Promise<RunDurationTrends> {
  if (pipelineDefinitionIds.length === 0) return Promise.resolve({});
  return fetchJson(
    `/api/runs/trends${buildQuery({
      pipelineDefinitionIds,
      limit,
    })}`,
    { trends: {} } as { trends: RunDurationTrends },
  ).then((r) => r.trends);
}

export function getRunDetail(pipelineId: string): Promise<RunDetail | null> {
  return fetchJson(`/api/runs/${encodeURIComponent(pipelineId)}`, null);
}

export function compareRuns(
  a: string,
  b: string,
): Promise<RunComparisonResult | null> {
  return fetchJson(`/api/runs/compare${buildQuery({ a, b })}`, null);
}

export function getProjects(): Promise<ProjectSummary[]> {
  return fetchJson("/api/projects", []);
}

export function getPanelData(query: PanelQuery = {}): Promise<PanelResult> {
  return fetchJson(`/api/panels${buildQuery({ ...query })}`, { rows: [] });
}
