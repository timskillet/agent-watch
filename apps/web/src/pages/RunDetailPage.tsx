import { useParams } from "react-router-dom";

export function RunDetailPage() {
  const { pipelineId } = useParams<{ pipelineId: string }>();
  return <h1>Run: {pipelineId}</h1>;
}
