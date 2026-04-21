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

type SideStatus =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "error" }
  | { kind: "loaded"; detail: RunDetail };

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
  const [statusA, setStatusA] = useState<SideStatus>({ kind: "idle" });
  const [statusB, setStatusB] = useState<SideStatus>({ kind: "idle" });

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset + in-flight pattern matches RunsTableWidget; keyed on [open, pipelineIdA, pipelineIdB].
    setStatusA({ kind: "loading" });
    setStatusB({ kind: "loading" });

    // Load each side independently so a failure on one doesn't hide the other.
    getRunDetail(pipelineIdA)
      .then((d) => {
        if (cancelled) return;
        setStatusA(
          d === null ? { kind: "error" } : { kind: "loaded", detail: d },
        );
      })
      .catch(() => {
        if (!cancelled) setStatusA({ kind: "error" });
      });
    getRunDetail(pipelineIdB)
      .then((d) => {
        if (cancelled) return;
        setStatusB(
          d === null ? { kind: "error" } : { kind: "loaded", detail: d },
        );
      })
      .catch(() => {
        if (!cancelled) setStatusB({ kind: "error" });
      });

    return () => {
      cancelled = true;
    };
  }, [open, pipelineIdA, pipelineIdB]);

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title="Trace comparison"
      width="min(1180px, calc(100vw - 48px))"
    >
      <div className={styles.columns}>
        <TraceColumn label={titleA} status={statusA} traceId={traceIdA} />
        <div className={styles.divider} aria-hidden="true" />
        <TraceColumn label={titleB} status={statusB} traceId={traceIdB} />
      </div>
    </Drawer>
  );
}

function findTrace(detail: RunDetail, traceId?: string): Trace | null {
  if (traceId === undefined) return null;
  return detail.traces.find((t) => t.traceId === traceId) ?? null;
}

interface TraceColumnProps {
  label: string;
  status: SideStatus;
  traceId?: string;
}

function TraceColumn({ label, status, traceId }: TraceColumnProps) {
  return (
    <div className={styles.column}>
      <div className={styles.columnHeader}>{label}</div>
      {status.kind === "loading" || status.kind === "idle" ? (
        <div className={styles.note}>Loading…</div>
      ) : status.kind === "error" ? (
        <div className={styles.error}>
          Failed to load this run&apos;s detail.
        </div>
      ) : (
        <TraceBodyOrEmpty detail={status.detail} traceId={traceId} />
      )}
    </div>
  );
}

function TraceBodyOrEmpty({
  detail,
  traceId,
}: {
  detail: RunDetail;
  traceId?: string;
}) {
  const trace = useMemo(() => findTrace(detail, traceId), [detail, traceId]);
  if (trace === null) {
    return <div className={styles.note}>Not present in this run.</div>;
  }
  return <TraceColumnBody trace={trace} />;
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
