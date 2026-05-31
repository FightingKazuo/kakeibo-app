import { SOURCE_CFG } from "../../constants";

export function SourceBadge({ source }) {
  const c = SOURCE_CFG[source] || SOURCE_CFG.manual;
  return (
    <span className={`text-xs px-1.5 py-0.5 rounded-full font-semibold flex-shrink-0 ${c.cls}`}>
      {c.label}
    </span>
  );
}
