import { SOURCE_CFG, CSV_SOURCES_ALL } from "../../constants";

// CSVフォーマットIDから短縮ラベルを取得
const getCsvShortLabel = (csvFormatId, csvSourceLabels) => {
  if (!csvFormatId) return null;
  if (csvSourceLabels && csvSourceLabels[csvFormatId]) return csvSourceLabels[csvFormatId];
  const src = CSV_SOURCES_ALL.find(s => s.id === csvFormatId);
  return src?.short || csvFormatId.toUpperCase().slice(0, 4);
};

export function SourceBadge({ source, csvFormatId, csvSourceLabels }) {
  const c = SOURCE_CFG[source] || SOURCE_CFG.manual;
  // CSVでカード名がある場合は「📊 SBI」「📊 EPOS」のようにカード名だけ表示
  const shortLabel = source === "csv" ? getCsvShortLabel(csvFormatId, csvSourceLabels) : null;
  const label = shortLabel ? `📊 ${shortLabel}` : c.label;
  return (
    <span className={`text-xs px-1.5 py-0.5 rounded-full font-semibold flex-shrink-0 ${c.cls}`}>
      {label}
    </span>
  );
}
