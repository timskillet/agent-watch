import { useEffect, useMemo, useState } from "react";
import type { RunDetail, Trace } from "@agentwatch/types";
import { getRunDetail } from "../../api/client";
import { buildTraceTree } from "../../lib/buildTraceTree";
import { formatDuration } from "../../lib/formatDuration";
import { Drawer, DrawerSection } from "../ui/Drawer";
import { LLMActivitySection } from "../widgets/run-detail/LLMActivitySection";
import { PromptPreviewSection } from "../widgets/run-detail/PromptPreviewSection";
import { TraceTree } from "../widgets/run-detail/TraceTree";
import styles from "./TracePairDrawer.module.css";

export interface TracePairDrawerProps {
  open: boolean;
  pipelineIdA: string;
  pipelineIdB: string;
  /** Trace id in run A (may be undefined if that side has no matched trace). */
  traceIdA?: string;
  /** Trace id in run B (may be undefined if that side has no matched trace). */
  traceIdB?: string;
  titleA: string;
  titleB: string;
  onClose: () => void;
}

export function TracePairDrawer({
  open,
  pipelineIdA,
  pipelineIdB,
  traceIdA,
  traceIdB,
  titleA,
  titleB,
  onClose,
}: TracePairDrawerProps) {
  const [detailA, setDetailA] = useState<RunDetail | null>(null);
  const [detailB, setDetailB] = useState<RunDetail | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset + in-flight pattern matches RunsTableWidget; keyed on [open, pipelineIdA, pipelineIdB].
    setLoading(true);
    setDetailA(null);
    setDetailB(null);
    Promise.all([getRunDetail(pipelineIdA), getRunDetail(pipelineIdB)])
      .then(([a, b]) => {
        if (cancelled) return;
        setDetailA(a);
        setDetailB(b);
        setLoading(false);
      })
      .catch(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, pipelineIdA, pipelineIdB]);

  const traceA = useMemo(
    () => findTrace(detailA, traceIdA),
    [detailA, traceIdA],
  );
  const traceB = useMemo(
    () => findTrace(detailB, traceIdB),
    [detailB, traceIdB],
  );

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title="Trace comparison"
      width="min(1180px, calc(100vw - 48px))"
    >
      <div className={styles.columns}>
        <TraceColumn label={titleA} trace={traceA} loading={loading} />
        <div className={styles.divider} aria-hidden="true" />
        <TraceColumn label={titleB} trace={traceB} loading={loading} />
      </div>
    </Drawer>
  );
}

function findTrace(detail: RunDetail | null, traceId?: string): Trace | null {
  if (detail === null || traceId === undefined) return null;
  return detail.traces.find((t) => t.traceId === traceId) ?? null;
}

interface TraceColumnProps {
  label: string;
  trace: Trace | null;
  loading: boolean;
}

function TraceColumn({ label, trace, loading }: TraceColumnProps) {
  return (
    <div className={styles.column}>
      <div className={styles.columnHeader}>{label}</div>
      {loading ? (
        <div className={styles.note}>Loading…</div>
      ) : trace === null ? (
        <div className={styles.note}>Not present in this run.</div>
      ) : (
        <TraceColumnBody trace={trace} />
      )}
    </div>
  );
}

function TraceColumnBody({ trace }: { trace: Trace }) {
  const tree = useMemo(() => buildTraceTree(trace.events), [trace]);

  return (
    <>
      <DrawerSection title="Prompt" defaultOpen>
        <PromptPreviewSection trace={trace} />
      </DrawerSection>
      <DrawerSection title="Tree">
        <TraceTree nodes={tree} onSelect={() => {}} />
      </DrawerSection>
      <DrawerSection title="LLM activity" defaultOpen={false}>
        <LLMActivitySection events={trace.events} />
      </DrawerSection>
      <DrawerSection title="Metadata" defaultOpen={false}>
        <dl className={styles.meta}>
          <dt>Trace ID</dt>
          <dd className={styles.mono}>{trace.traceId}</dd>
          <dt>Duration</dt>
          <dd>{formatDuration(trace.durationMs)}</dd>
          <dt>Tokens</dt>
          <dd>
            ↑ {trace.inputTokens.toLocaleString()} in · ↓{" "}
            {trace.outputTokens.toLocaleString()} out
          </dd>
          <dt>Cost</dt>
          <dd>
            {trace.cost !== undefined ? `$${trace.cost.toFixed(4)}` : "—"}
          </dd>
          <dt>Errors</dt>
          <dd>{trace.errorCount}</dd>
          <dt>Retries</dt>
          <dd>{trace.retryCount}</dd>
        </dl>
      </DrawerSection>
    </>
  );
}
