import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import type {
  AgentRollup,
  RunComparisonResult,
  RunSummaryForCompare,
  TraceRollup,
} from "@agentwatch/types";
import { compareRuns } from "../api/client";
import { ComparisonTable } from "../components/compare/ComparisonTable";
import type { ComparisonRow } from "../components/compare/ComparisonTable";
import { TracePairDrawer } from "../components/compare/TracePairDrawer";
import { matchAgents } from "../lib/matchAgents";
import { matchTraces } from "../lib/matchTraces";
import styles from "./ComparePage.module.css";

type PendingPair = {
  traceIdA?: string;
  traceIdB?: string;
};

export function ComparePage() {
  const [searchParams] = useSearchParams();
  const a = searchParams.get("a");
  const b = searchParams.get("b");
  const [data, setData] = useState<RunComparisonResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const hasParams = a !== null && b !== null;
  const [loading, setLoading] = useState(hasParams);
  const [pending, setPending] = useState<PendingPair | null>(null);

  useEffect(() => {
    if (a === null || b === null) return;
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- matches the in-flight pattern used elsewhere (e.g. RunsTableWidget); refetch key is the [a, b] dep.
    setLoading(true);
    setError(null);
    compareRuns(a, b)
      .then((result) => {
        if (cancelled) return;
        if (result === null) {
          setError("One or both runs could not be loaded.");
        } else {
          setData(result);
        }
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setError("Failed to fetch comparison.");
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [a, b]);

  if (a === null || b === null) {
    return (
      <div className={styles.errorState}>
        <p>
          Missing required query parameters: <code>?a=&b=</code>.
        </p>
        <Link to="/">Back to dashboard</Link>
      </div>
    );
  }

  if (loading) {
    return <div className={styles.loading}>Loading comparison…</div>;
  }

  if (error !== null || data === null) {
    return (
      <div className={styles.errorState}>
        <p>{error ?? "Failed to load comparison."}</p>
        <Link to="/">Back to dashboard</Link>
      </div>
    );
  }

  return (
    <CompareBody
      data={data}
      pending={pending}
      onOpenTracePair={setPending}
      onCloseTracePair={() => setPending(null)}
    />
  );
}

interface CompareBodyProps {
  data: RunComparisonResult;
  pending: PendingPair | null;
  onOpenTracePair: (pair: PendingPair) => void;
  onCloseTracePair: () => void;
}

function CompareBody({
  data,
  pending,
  onOpenTracePair,
  onCloseTracePair,
}: CompareBodyProps) {
  const summaryRows = useMemo<ComparisonRow[]>(
    () => [
      {
        id: "duration",
        label: "Duration",
        a: data.a.durationMs,
        b: data.b.durationMs,
        format: "duration",
      },
      {
        id: "cost",
        label: "Cost",
        a: data.a.cost,
        b: data.b.cost,
        format: "cost",
      },
      {
        id: "llm",
        label: "LLM calls",
        a: data.a.llmCallCount,
        b: data.b.llmCallCount,
        format: "count",
      },
      {
        id: "tools",
        label: "Tool calls",
        a: data.a.toolCallCount,
        b: data.b.toolCallCount,
        format: "count",
      },
      {
        id: "errors",
        label: "Errors",
        a: data.a.errorCount,
        b: data.b.errorCount,
        format: "count",
      },
      {
        id: "tin",
        label: "Input tokens",
        a: data.a.inputTokens,
        b: data.b.inputTokens,
        format: "tokens",
      },
      {
        id: "tout",
        label: "Output tokens",
        a: data.a.outputTokens,
        b: data.b.outputTokens,
        format: "tokens",
      },
    ],
    [data],
  );

  const traceMatches = useMemo(
    () => matchTraces(data.tracesA, data.tracesB),
    [data],
  );
  const traceRows = useMemo<ComparisonRow[]>(
    () =>
      traceMatches.map((m): ComparisonRow => {
        const label = traceMatchLabel(m.a, m.b);
        const sublabel = traceMatchSublabel(m.a, m.b);
        return {
          id: `trace-${m.position}`,
          label,
          sublabel,
          a: m.a?.durationMs,
          b: m.b?.durationMs,
          format: "duration",
          onClick: () =>
            onOpenTracePair({
              traceIdA: m.a?.traceId,
              traceIdB: m.b?.traceId,
            }),
        };
      }),
    [traceMatches, onOpenTracePair],
  );

  const agentMatches = useMemo(
    () => matchAgents(data.agentsA, data.agentsB),
    [data],
  );
  const agentRows = useMemo<ComparisonRow[]>(
    () =>
      agentMatches.map(
        (m): ComparisonRow => ({
          id: `agent-${m.agentId}`,
          label: m.agentId,
          sublabel: agentSublabel(m.a, m.b),
          a: m.a?.durationMs,
          b: m.b?.durationMs,
          format: "duration",
        }),
      ),
    [agentMatches],
  );

  const showAgentTier =
    data.agentsA.length > 1 ||
    data.agentsB.length > 1 ||
    // Any agentId only on one side → useful even when each run is single-agent.
    agentMatches.some((m) => m.a === undefined || m.b === undefined);

  return (
    <div className={styles.page}>
      <div className={styles.pageHeader}>
        <Link to="/" className={styles.backLink}>
          ← Back to dashboard
        </Link>
        <h1 className={styles.title}>Run comparison</h1>
      </div>

      <div className={styles.runCards}>
        <RunCard role="A" summary={data.a} />
        <RunCard role="B" summary={data.b} />
      </div>

      <ComparisonTable
        title="Summary"
        rows={summaryRows}
        labelHeader="Metric"
        aLabel={cardLabel("A", data.a)}
        bLabel={cardLabel("B", data.b)}
      />

      <ComparisonTable
        title="Traces"
        rows={traceRows}
        labelHeader="Prompt"
        aLabel={cardLabel("A", data.a)}
        bLabel={cardLabel("B", data.b)}
        emptyText="Neither run has any traces."
      />

      {showAgentTier && (
        <ComparisonTable
          title="Agents"
          rows={agentRows}
          labelHeader="Agent"
          aLabel={cardLabel("A", data.a)}
          bLabel={cardLabel("B", data.b)}
          emptyText="No agents recorded."
        />
      )}

      {pending !== null && (
        <TracePairDrawer
          open
          pipelineIdA={data.a.pipelineId}
          pipelineIdB={data.b.pipelineId}
          traceIdA={pending.traceIdA}
          traceIdB={pending.traceIdB}
          titleA={cardLabel("A", data.a)}
          titleB={cardLabel("B", data.b)}
          onClose={onCloseTracePair}
        />
      )}
    </div>
  );
}

function RunCard({
  role,
  summary,
}: {
  role: "A" | "B";
  summary: RunSummaryForCompare;
}) {
  return (
    <div className={styles.runCard}>
      <div className={styles.runCardHeader}>
        <span className={styles.runRole}>Run {role}</span>
        <span
          className={`${styles.statusDot} ${statusDotClass(summary.status)}`}
        />
        <span className={styles.runStatus}>{summary.status}</span>
      </div>
      <div className={styles.runId} title={summary.pipelineId}>
        {summary.pipelineDefinitionId ?? summary.pipelineId.slice(0, 8)}
      </div>
      <dl className={styles.runStats}>
        <dt>Started</dt>
        <dd>{new Date(summary.startTime).toLocaleString()}</dd>
        <dt>Duration</dt>
        <dd>{formatDurationLabel(summary.durationMs)}</dd>
        <dt>Cost</dt>
        <dd>
          {summary.cost !== undefined ? `$${summary.cost.toFixed(2)}` : "—"}
        </dd>
        <dt>Events</dt>
        <dd>{summary.eventCount.toLocaleString()}</dd>
        <dt>Source</dt>
        <dd>{summary.ingestionSource ?? "—"}</dd>
      </dl>
    </div>
  );
}

function cardLabel(role: "A" | "B", summary: RunSummaryForCompare): string {
  const short = summary.pipelineId.slice(0, 8);
  return summary.pipelineDefinitionId
    ? `${role} · ${summary.pipelineDefinitionId}/${short}`
    : `${role} · ${short}`;
}

function statusDotClass(status: RunSummaryForCompare["status"]): string {
  switch (status) {
    case "completed":
      return styles.statusOk;
    case "failed":
      return styles.statusError;
    default:
      return styles.statusRunning;
  }
}

function formatDurationLabel(ms: number | undefined): string {
  if (ms === undefined) return "—";
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  const m = Math.floor(ms / 60_000);
  const s = Math.floor((ms % 60_000) / 1000);
  return `${m}m ${s}s`;
}

function traceMatchLabel(
  a: TraceRollup | undefined,
  b: TraceRollup | undefined,
): string {
  const src = a ?? b;
  if (src === undefined) return "Unknown trace";
  if (src.promptPreview !== undefined && src.promptPreview.length > 0) {
    const short =
      src.promptPreview.length > 80
        ? `${src.promptPreview.slice(0, 80)}…`
        : src.promptPreview;
    return short;
  }
  return `Trace ${src.index}`;
}

function traceMatchSublabel(
  a: TraceRollup | undefined,
  b: TraceRollup | undefined,
): string | undefined {
  if (a === undefined) return "Only in Run B";
  if (b === undefined) return "Only in Run A";
  const toolsA = Object.keys(a.toolCounts).length;
  const toolsB = Object.keys(b.toolCounts).length;
  return `A: ${toolsA} distinct tools · B: ${toolsB} distinct tools`;
}

function agentSublabel(
  a: AgentRollup | undefined,
  b: AgentRollup | undefined,
): string | undefined {
  if (a === undefined) return "Only in Run B";
  if (b === undefined) return "Only in Run A";
  return undefined;
}
