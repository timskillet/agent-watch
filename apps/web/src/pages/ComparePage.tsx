import { useSearchParams } from "react-router-dom";

export function ComparePage() {
  const [searchParams] = useSearchParams();
  const a = searchParams.get("a");
  const b = searchParams.get("b");
  return (
    <h1>
      Compare: {a ?? "?"} vs {b ?? "?"}
    </h1>
  );
}
