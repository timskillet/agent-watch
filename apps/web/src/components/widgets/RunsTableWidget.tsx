import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type {
  AgentWatchEvent,
  IngestionSource,
  PipelineRunSummary,
  RunDetail,
  RunDurationTrends,
  RunSortDir,
  RunSortKey,
  RunStatus,
  TimeRange,
} from "@agentwatch/types";
import { getRunDetail, getRunDurationTrends, getRuns } from "../../api/client";
import { Sparkline } from "../../charts/Sparkline";
import { useSelection } from "../../context/SelectionContext";
import type { WidgetProps } from "../../widgets/types";
import { Badge } from "../ui/Badge";
import { Button } from "../ui/Button";
import { Checkbox } from "../ui/Checkbox";
import { EmptyState } from "../ui/EmptyState";
import { Select } from "../ui/Select";
import { Skeleton } from "../ui/Skeleton";
import { TextInput } from "../ui/TextInput";
import { TimeRangePicker } from "../ui/TimeRangePicker";
import { ToolCallDrawer } from "./run-detail/ToolCallDrawer";
import { ToolCallList } from "./run-detail/ToolCallList";
import {
  DEFAULT_TIME_RANGE,
  migrateTimeRange,
  resolveTimeRange,
} from "../../lib/timeRange";
import styles from "./RunsTableWidget.module.css";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ColumnKey =
  | "pipeline"
  | "status"
  | "started"
  | "duration"
  | "events"
  | "cost"
  | "trend"
  | "source";

const ALL_COLUMNS: { key: ColumnKey; label: string; sortKey?: RunSortKey }[] = [
  { key: "pipeline", label: "Pipeline", sortKey: "pipelineDefinitionId" },
  { key: "status", label: "Status", sortKey: "status" },
  { key: "started", label: "Started", sortKey: "startTime" },
  { key: "duration", label: "Duration", sortKey: "durationMs" },
  { key: "events", label: "Events", sortKey: "eventCount" },
  { key: "cost", label: "Cost", sortKey: "cost" },
  { key: "trend", label: "Trend" },
  { key: "source", label: "Source" },
];

const ALL_STATUSES: RunStatus[] = ["running", "completed", "failed"];
const ALL_SOURCES: IngestionSource[] = ["claude_code_hook", "otlp"];
const PAGE_SIZES = [25, 50, 100] as const;

interface FilterConfig {
  search: string;
  statuses: RunStatus[];
  sources: IngestionSource[];
  range: TimeRange;
}

interface RunsTableConfig {
  pageSize: number;
  sort: { key: RunSortKey; dir: RunSortDir };
  columnVisibility: Record<ColumnKey, boolean>;
  filters: FilterConfig;
  costThreshold: number;
}

const DEFAULT_CONFIG: RunsTableConfig = {
  pageSize: 25,
  sort: { key: "startTime", dir: "desc" },
  columnVisibility: {
    pipeline: true,
    status: true,
    started: true,
    duration: true,
    events: true,
    cost: true,
    trend: true,
    source: true,
  },
  filters: { search: "", statuses: [], sources: [], range: DEFAULT_TIME_RANGE },
  costThreshold: 0.5,
};

function readConfig(raw: Record<string, unknown>): RunsTableConfig {
  // Defensive: configs persisted from older versions may be missing fields.
  // Merge against DEFAULT_CONFIG without blowing up on shape mismatches.
  const r = raw as Partial<RunsTableConfig> & {
    filters?: Partial<FilterConfig> & { since?: number; until?: number };
  };
  return {
    pageSize:
      typeof r.pageSize === "number" && PAGE_SIZES.includes(r.pageSize as 25)
        ? r.pageSize
        : DEFAULT_CONFIG.pageSize,
    sort:
      r.sort && typeof r.sort === "object"
        ? {
            key: (r.sort.key as RunSortKey) ?? DEFAULT_CONFIG.sort.key,
            dir: r.sort.dir === "asc" ? "asc" : "desc",
          }
        : DEFAULT_CONFIG.sort,
    columnVisibility: {
      ...DEFAULT_CONFIG.columnVisibility,
      ...(r.columnVisibility ?? {}),
    },
    filters: {
      search: r.filters?.search ?? "",
      statuses: Array.isArray(r.filters?.statuses) ? r.filters.statuses : [],
      sources: Array.isArray(r.filters?.sources) ? r.filters.sources : [],
      range: migrateTimeRange(
        r.filters?.range ??
          // Legacy: reconstruct from since/until if present (both required)
          (typeof r.filters?.since === "number" &&
          typeof r.filters?.until === "number"
            ? { since: r.filters.since, until: r.filters.until }
            : undefined),
      ),
    },
    costThreshold:
      typeof r.costThreshold === "number"
        ? r.costThreshold
        : DEFAULT_CONFIG.costThreshold,
  };
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function RunsTableWidget({
  config,
  onConfigChange,
  isConfigOpen,
}: WidgetProps) {
  const cfg = useMemo(() => readConfig(config), [config]);
  const { selectedSessionId, setSelectedSessionId } = useSelection();

  // Local UI state — debounced search input lives here so typing doesn't write
  // to localStorage on every keystroke.
  const [searchInput, setSearchInput] = useState(cfg.filters.search);
  const [page, setPage] = useState(0);
  const [runs, setRuns] = useState<PipelineRunSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [trends, setTrends] = useState<RunDurationTrends>({});
  const [loading, setLoading] = useState(true);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [details, setDetails] = useState<Map<string, RunDetail>>(new Map());
  const [toolSearchById, setToolSearchById] = useState<Record<string, string>>(
    {},
  );
  const [selectedTool, setSelectedTool] = useState<{
    runId: string;
    event: AgentWatchEvent;
  } | null>(null);

  // Debounce search input → persist to config after 250ms idle.
  useEffect(() => {
    if (searchInput === cfg.filters.search) return;
    const t = setTimeout(() => {
      onConfigChange({
        ...config,
        filters: { ...cfg.filters, search: searchInput },
      });
    }, 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchInput]);

  // Reset to first page whenever filters or sort change.
  const filterKey = JSON.stringify({ ...cfg.filters, ...cfg.sort });
  useEffect(() => {
    setPage(0);
  }, [filterKey]);

  // Fetch runs + trends on every relevant change.
  useEffect(() => {
    let ignore = false;
    setLoading(true);
    const { since, until } = resolveTimeRange(cfg.filters.range);
    const fetchPromise = getRuns({
      pipelineDefinitionId: undefined,
      status:
        cfg.filters.statuses.length > 0 ? cfg.filters.statuses : undefined,
      ingestionSource:
        cfg.filters.sources.length > 0 ? cfg.filters.sources : undefined,
      search: cfg.filters.search || undefined,
      since,
      until,
      sortBy: cfg.sort.key,
      sortDir: cfg.sort.dir,
      limit: cfg.pageSize,
      offset: page * cfg.pageSize,
    });

    fetchPromise
      .then(async (res) => {
        if (ignore) return;
        setRuns(res.rows);
        setTotal(res.total);

        const ids = Array.from(
          new Set(
            res.rows
              .map((r) => r.pipelineDefinitionId)
              .filter((id): id is string => Boolean(id)),
          ),
        );
        const trendData =
          ids.length > 0 ? await getRunDurationTrends(ids, 10) : {};
        if (ignore) return;
        setTrends(trendData);
        setLoading(false);
      })
      .catch(() => {
        if (!ignore) setLoading(false);
      });

    return () => {
      ignore = true;
    };
  }, [
    filterKey,
    page,
    cfg.pageSize,
    cfg.filters.search,
    cfg.filters.statuses,
    cfg.filters.sources,
    cfg.filters.range,
    cfg.sort.key,
    cfg.sort.dir,
  ]);

  // Lazily fetch RunDetail when a row expands. On failure, drop the id from
  // detailFetched so a subsequent collapse + re-expand can retry instead of
  // showing the loading skeleton forever.
  const detailFetched = useRef<Set<string>>(new Set());
  useEffect(() => {
    for (const id of expandedIds) {
      if (detailFetched.current.has(id)) continue;
      detailFetched.current.add(id);
      getRunDetail(id)
        .then((d) => {
          if (d) {
            setDetails((prev) => new Map(prev).set(id, d));
          } else {
            detailFetched.current.delete(id);
          }
        })
        .catch(() => {
          detailFetched.current.delete(id);
        });
    }
  }, [expandedIds]);

  const setSort = useCallback(
    (sortKey: RunSortKey) => {
      const nextDir: RunSortDir =
        cfg.sort.key === sortKey && cfg.sort.dir === "desc" ? "asc" : "desc";
      onConfigChange({
        ...config,
        sort: { key: sortKey, dir: nextDir },
      });
    },
    [cfg.sort.key, cfg.sort.dir, config, onConfigChange],
  );

  const toggleStatus = useCallback(
    (s: RunStatus) => {
      const next = cfg.filters.statuses.includes(s)
        ? cfg.filters.statuses.filter((x) => x !== s)
        : [...cfg.filters.statuses, s];
      onConfigChange({
        ...config,
        filters: { ...cfg.filters, statuses: next },
      });
    },
    [cfg.filters, config, onConfigChange],
  );

  const toggleSource = useCallback(
    (s: IngestionSource) => {
      const next = cfg.filters.sources.includes(s)
        ? cfg.filters.sources.filter((x) => x !== s)
        : [...cfg.filters.sources, s];
      onConfigChange({
        ...config,
        filters: { ...cfg.filters, sources: next },
      });
    },
    [cfg.filters, config, onConfigChange],
  );

  const toggleExpand = useCallback(
    (pipelineId: string) => {
      setExpandedIds((prev) => {
        const next = new Set(prev);
        if (next.has(pipelineId)) {
          next.delete(pipelineId);
          // Close the drawer when collapsing the row that owns it.
          if (selectedTool?.runId === pipelineId) {
            setSelectedTool(null);
          }
        } else {
          next.add(pipelineId);
        }
        return next;
      });
    },
    [selectedTool],
  );

  const visibleColumns = useMemo(
    () => ALL_COLUMNS.filter((c) => cfg.columnVisibility[c.key]),
    [cfg.columnVisibility],
  );

  const maxDuration = useMemo(
    () =>
      runs.reduce(
        (max, r) => Math.max(max, r.durationMs ?? 0),
        1, // avoid divide-by-zero
      ),
    [runs],
  );

  const totalPages = Math.max(1, Math.ceil(total / cfg.pageSize));
  const colSpan = visibleColumns.length + 1; // +1 for chevron

  // Configuration panel (gear) — preferences only; live filters are in the main bar.
  if (isConfigOpen) {
    return (
      <div className={styles.configPanel}>
        <div className={styles.configRow}>
          <span className={styles.configLabel}>Default page size</span>
          <Select
            value={String(cfg.pageSize)}
            onChange={(e) =>
              onConfigChange({ ...config, pageSize: Number(e.target.value) })
            }
          >
            {PAGE_SIZES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </Select>
        </div>

        <div className={styles.configRow}>
          <span className={styles.configLabel}>Visible columns</span>
          <div className={styles.checkboxGroup}>
            {ALL_COLUMNS.map((c) => (
              <Checkbox
                key={c.key}
                id={`col-${c.key}`}
                checked={cfg.columnVisibility[c.key]}
                onChange={(e) =>
                  onConfigChange({
                    ...config,
                    columnVisibility: {
                      ...cfg.columnVisibility,
                      [c.key]: e.target.checked,
                    },
                  })
                }
                label={c.label}
              />
            ))}
          </div>
        </div>

        <div className={styles.configRow}>
          <span className={styles.configLabel}>Cost threshold ($)</span>
          <TextInput
            type="number"
            min="0"
            step="0.05"
            value={String(cfg.costThreshold)}
            onChange={(e) => {
              const v = Number(e.target.value);
              if (Number.isFinite(v)) {
                onConfigChange({ ...config, costThreshold: v });
              }
            }}
          />
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      {/* Filter bar */}
      <div className={styles.filterBar}>
        <div className={styles.filterRow}>
          <TextInput
            placeholder="Search pipelines…"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            leadingIcon="🔍"
          />
        </div>
        <div className={styles.filterRow}>
          <span className={styles.filterLabel}>Status:</span>
          {ALL_STATUSES.map((s) => (
            <Checkbox
              key={s}
              id={`flt-status-${s}`}
              checked={cfg.filters.statuses.includes(s)}
              onChange={() => toggleStatus(s)}
              label={s}
            />
          ))}
          <span className={styles.filterDivider} />
          <span className={styles.filterLabel}>Source:</span>
          {ALL_SOURCES.map((s) => (
            <Checkbox
              key={s}
              id={`flt-src-${s}`}
              checked={cfg.filters.sources.includes(s)}
              onChange={() => toggleSource(s)}
              label={s === "claude_code_hook" ? "Claude Code" : "OTLP"}
            />
          ))}
        </div>
        <div className={styles.filterRow}>
          <span className={styles.filterLabel}>Range:</span>
          <TimeRangePicker
            value={cfg.filters.range}
            onChange={(range) =>
              onConfigChange({
                ...config,
                filters: { ...cfg.filters, range },
              })
            }
            size="sm"
          />
        </div>
      </div>

      {/* Table */}
      <div className={styles.tableWrap}>
        {loading ? (
          <Skeleton variant="row" lines={5} />
        ) : runs.length === 0 ? (
          <EmptyState icon="📋" message="No runs match these filters" />
        ) : (
          <table className={styles.table}>
            <thead>
              <tr>
                <th className={styles.chevronCol} />
                {visibleColumns.map((c) => {
                  const sortable = c.sortKey != null;
                  const isActive = sortable && cfg.sort.key === c.sortKey;
                  return (
                    <th
                      key={c.key}
                      className={sortable ? styles.sortable : undefined}
                      onClick={sortable ? () => setSort(c.sortKey!) : undefined}
                    >
                      {c.label}
                      {isActive && (
                        <span className={styles.sortArrow}>
                          {cfg.sort.dir === "desc" ? "▼" : "▲"}
                        </span>
                      )}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {runs.map((run) => {
                const expanded = expandedIds.has(run.pipelineId);
                const detail = details.get(run.pipelineId);
                return (
                  <Fragment key={run.pipelineId}>
                    <tr
                      onClick={() => setSelectedSessionId(run.pipelineId)}
                      className={`${styles.row} ${
                        run.pipelineId === selectedSessionId
                          ? styles.rowSelected
                          : ""
                      }`}
                    >
                      <td className={styles.chevronCol}>
                        <button
                          type="button"
                          className={`${styles.chevron} ${expanded ? styles.chevronOpen : ""}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleExpand(run.pipelineId);
                          }}
                          aria-label={expanded ? "Collapse" : "Expand"}
                        >
                          ▶
                        </button>
                      </td>
                      {visibleColumns.map((c) => (
                        <td key={c.key}>
                          {renderCell(c.key, run, {
                            maxDuration,
                            costThreshold: cfg.costThreshold,
                            trend: run.pipelineDefinitionId
                              ? trends[run.pipelineDefinitionId]
                              : undefined,
                          })}
                        </td>
                      ))}
                    </tr>
                    {expanded && (
                      <tr className={styles.expandedRow}>
                        <td colSpan={colSpan}>
                          <ExpandedDetail
                            run={run}
                            detail={detail}
                            search={toolSearchById[run.pipelineId] ?? ""}
                            onSearchChange={(s) =>
                              setToolSearchById((prev) => ({
                                ...prev,
                                [run.pipelineId]: s,
                              }))
                            }
                            onSelectTool={(event) =>
                              setSelectedTool({
                                runId: run.pipelineId,
                                event,
                              })
                            }
                            selectedToolId={
                              selectedTool?.runId === run.pipelineId
                                ? selectedTool.event.id
                                : undefined
                            }
                          />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination footer */}
      <div className={styles.pagination}>
        <span className={styles.paginationInfo}>
          {total === 0
            ? "0 runs"
            : `Page ${page + 1} of ${totalPages} · ${total} total`}
        </span>
        <span className={styles.paginationGap} />
        <Select
          value={String(cfg.pageSize)}
          onChange={(e) =>
            onConfigChange({ ...config, pageSize: Number(e.target.value) })
          }
        >
          {PAGE_SIZES.map((s) => (
            <option key={s} value={s}>
              {s}/page
            </option>
          ))}
        </Select>
        <Button
          size="sm"
          variant="ghost"
          disabled={page === 0}
          onClick={() => setPage((p) => Math.max(0, p - 1))}
        >
          Prev
        </Button>
        <Button
          size="sm"
          variant="ghost"
          disabled={page >= totalPages - 1 || total === 0}
          onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
        >
          Next
        </Button>
      </div>

      {selectedTool != null &&
        (() => {
          const d = details.get(selectedTool.runId);
          return (
            <ToolCallDrawer
              events={d?.events ?? []}
              selectedEvent={selectedTool.event}
              onClose={() => setSelectedTool(null)}
            />
          );
        })()}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Cell rendering
// ---------------------------------------------------------------------------

interface CellContext {
  maxDuration: number;
  costThreshold: number;
  trend: { startTime: number; durationMs: number }[] | undefined;
}

function renderCell(key: ColumnKey, run: PipelineRunSummary, ctx: CellContext) {
  switch (key) {
    case "pipeline":
      return (
        <span className={styles.pipelineCell} title={run.pipelineId}>
          {run.pipelineDefinitionId ?? run.pipelineId.slice(0, 8)}
        </span>
      );
    case "status":
      return <StatusDot status={run.status} />;
    case "started":
      return (
        <span title={new Date(run.startTime).toLocaleString()}>
          {formatRelative(run.startTime)}
        </span>
      );
    case "duration": {
      if (run.durationMs == null) return <span>—</span>;
      const pct = Math.min(100, (run.durationMs / ctx.maxDuration) * 100);
      return (
        <div className={styles.durationCell}>
          <span className={styles.durationText}>
            {formatDuration(run.durationMs)}
          </span>
          <span className={styles.durationBar}>
            <span
              className={styles.durationBarFill}
              style={{ width: `${pct}%` }}
            />
          </span>
        </div>
      );
    }
    case "events":
      return <Badge variant="neutral">{String(run.eventCount)}</Badge>;
    case "cost":
      if (run.cost == null) return <span className={styles.muted}>—</span>;
      return (
        <span
          className={run.cost > ctx.costThreshold ? styles.costHigh : undefined}
        >
          ${run.cost.toFixed(2)}
        </span>
      );
    case "trend": {
      const data = ctx.trend ?? [];
      if (data.length < 2) return <span className={styles.muted}>—</span>;
      return (
        <div className={styles.trendCell}>
          <Sparkline data={data} yKey="durationMs" width={80} height={20} />
        </div>
      );
    }
    case "source":
      return (
        <span className={styles.sourceCell}>
          {run.ingestionSource === "claude_code_hook"
            ? "claude_code"
            : (run.ingestionSource ?? "—")}
        </span>
      );
  }
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function StatusDot({ status }: { status: RunStatus }) {
  const cls =
    status === "completed"
      ? styles.dotSuccess
      : status === "failed"
        ? styles.dotError
        : styles.dotInfo;
  return (
    <span className={styles.statusCell} title={status}>
      <span className={`${styles.dot} ${cls}`} />
      <span>{status}</span>
    </span>
  );
}

function ExpandedDetail({
  run,
  detail,
  search,
  onSearchChange,
  onSelectTool,
  selectedToolId,
}: {
  run: PipelineRunSummary;
  detail: RunDetail | undefined;
  search: string;
  onSearchChange: (s: string) => void;
  onSelectTool: (e: AgentWatchEvent) => void;
  selectedToolId?: string;
}) {
  return (
    <div className={styles.expandedPanel}>
      <div className={styles.expandedTools}>
        <div className={styles.expandedSearch}>
          <TextInput
            leadingIcon="🔍"
            placeholder="Search tool calls…"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            size="sm"
          />
        </div>
        {detail ? (
          <ToolCallList
            events={detail.events}
            search={search}
            onSelect={onSelectTool}
            selectedId={selectedToolId}
          />
        ) : (
          <Skeleton variant="block" height={96} />
        )}
      </div>
      <dl className={styles.expandedMetrics}>
        <dt>Events</dt>
        <dd>{run.eventCount}</dd>
        <dt>Duration</dt>
        <dd>{run.durationMs != null ? formatDuration(run.durationMs) : "—"}</dd>
        <dt>Cost</dt>
        <dd>{run.cost != null ? `$${run.cost.toFixed(2)}` : "—"}</dd>
        <dt>Agents</dt>
        <dd>{run.agents.join(", ") || "—"}</dd>
        <dt>Source</dt>
        <dd>{run.ingestionSource ?? "—"}</dd>
        <dt>Pipeline ID</dt>
        <dd className={styles.mono}>{run.pipelineId}</dd>
      </dl>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  const m = Math.floor(ms / 60_000);
  const s = Math.floor((ms % 60_000) / 1000);
  return `${m}m ${s}s`;
}

function formatRelative(ts: number): string {
  const now = Date.now();
  const diff = now - ts;
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  if (diff < 7 * 86_400_000) return `${Math.floor(diff / 86_400_000)}d ago`;
  return new Date(ts).toLocaleDateString();
}
