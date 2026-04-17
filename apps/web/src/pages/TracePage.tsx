import { useParams } from "react-router-dom";

export function TracePage() {
  const { pipelineId, agentId } = useParams<{
    pipelineId: string;
    agentId: string;
  }>();
  return (
    <h1>
      Trace: {agentId} in {pipelineId}
    </h1>
  );
}
