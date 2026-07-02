import { useState, useRef } from "react";
import { createTransaction, DUPLICATE_KEY } from "../../services/transaction";
import { parseCSVText, readCSVFile, detectCSVFormat } from "../../services/csvParser";
import { STORAGE_KEYS } from "../../constants/storage";
import { parsePDF, PDF_FORMAT_LABELS } from "../../services/pdfParser";
import { analyzePDFWithGemini } from "../../services/geminiOcr";
import { CSV_FORMATS, DEFAULT_CATEGORY_RULES } from "../../constants";
import { loadStorage } from "../../utils/storage";
import { fmtCurrency } from "../../utils/format";
import { PrimaryButton } from "../ui/PrimaryButton";

export function CsvImportPage({ categories, existingTransactions, ocrCorrections, learnedRules, members, pointAccounts, importHistory, activeCsvSources: props_activeCsvSources, onActiveCsvSourcesChange, onAdd, onDelete, onLearnRule, onImportHistoryChange, onBack }) {
  const [csvFormat,       setCsvFormat]       = useState("generic");
  const [defaultShareType,setDefaultShareType]= useState("shared");
  const [csvDetected,     setCsvDetected]     = useState(null);
  const [csvFormatIds,    setCsvFormatIds]    = useState([]);
  const [csvShowOverride, setCsvShowOverride] = useState(false);
  const [csvRows,         setCsvRows]         = useState([]);
  const [csvChecked,      setCsvChecked]      = useState({});
  const [csvStep,         setCsvStep]         = useState("upload");
  const [ocrActions,      setOcrActions]      = useState({});
  const [csvSummary,      setCsvSummary]      = useState(null);
  const [csvEditIdx,      setCsvEditIdx]      = useState(null);
  const [csvPdfLoading,   setCsvPdfLoading]   = useState(false);

  const geminiKey = loadStorage("GEMINI_API_KEY", "") || "";
  const fileRef   = useRef(null);
  const selfId    = members?.[0]?.id || null;

  const isDupRow     = (r) => r.isDuplicate || r.isCardWithdrawal || (r.ocrDuplicates?.length > 0) || r.isCardWarning || r.isTransfer;
  const isHardDupRow = (r) => false;
  const isOcrOnlyDup = (r) => (r.ocrDuplicates?.length > 0) || r.isCardWarning || r.isDuplicate || r.isTransfer || r.isCardWithdrawal;

  const updateCsvRow = (i, key, val) => setCsvRows(p => p.map((r, j) => j === i ? { ...r, [key]: val } : r));

  // 大きいチェックボックス
  const BigCheckbox = ({ checked, onChange }) => (
    <div
      onClick={e => { e.stopPropagation(); onChange(); }}
      className={`w-6 h-6 rounded-md border-2 flex items-center justify-center flex-shrink-0 cursor-pointer transition-all ${
        checked ? "bg-indigo-500 border-indigo-500" : "bg-white border-gray-300"
      }`}
    >
      {checked && <span className="text-white text-xs font-bold">✓</span>}
    </div>
  );

  const renderCsvRow = (r, i) => {
    const isOcrDup      = isOcrOnlyDup(r);
    const isCategorized = r.category !== "その他";
    const shareType     = r.shareType || defaultShareType;
    const shareCfg = {
      shared:   ["🤝", "共有",  "bg-indigo-50 text-indigo-600 border-indigo-200"],
      personal: ["👤", "個人",  "bg-rose-50 text-rose-500 border-rose-200"],
      partner:  ["👥", "相手",  "bg-purple-50 text-purple-600 border-purple-200"],
    }[shareType] || ["🤝", "共有", "bg-indigo-50 text-indigo-600 border-indigo-200"];

    return (
      <div key={i} className={`border-b border-gray-50 last:border-b-0 ${isOcrDup ? "bg-yellow-50/60" : isCategorized ? "bg-emerald-50" : "bg-white"}`}>
        <div className="flex items-center gap-3 px-4 py-3">
          {r.ocrDuplicates?.length > 0 ? (
            // OCR重複行：3択ボタン
            <div className="flex flex-col gap-1 flex-shrink-0">
              {[
                { key: "both",    label: "両方",   color: "bg-blue-100 text-blue-600 ring-blue-400"    },
                { key: "replace", label: "置換",   color: "bg-amber-100 text-amber-600 ring-amber-400" },
                { key: "skip",    label: "スキップ", color: "bg-gray-100 text-gray-500 ring-gray-400"  },
              ].map(({ key, label, color }) => (
                <button key={key}
                  onClick={() => setOcrActions(p => ({ ...p, [i]: key }))}
                  className={`text-xs px-2 py-0.5 rounded-full font-semibold transition-all ${color} ${
                    (ocrActions[i] || "skip") === key ? "ring-2" : "opacity-40"
                  }`}>
                  {label}
                </button>
              ))}
            </div>
          ) : (
            <BigCheckbox checked={!!csvChecked[i]} onChange={() => setCsvChecked(p => ({ ...p, [i]: !p[i] }))} />
          )}
          <div className="flex-1 min-w-0" onClick={() => setCsvEditIdx(csvEditIdx === i ? null : i)}>
            <div className="flex items-center gap-1 flex-wrap">
              <p className={`text-sm font-medium truncate ${(r.isDuplicate || r.isTransfer) ? "text-gray-400" : "text-gray-800"}`}>{r.label}</p>
              {r.isDuplicate      && <span className="text-xs bg-gray-200 text-gray-500 px-1.5 py-0.5 rounded-full flex-shrink-0">重複</span>}
              {r.isTransfer       && <span className="text-xs bg-gray-200 text-gray-500 px-1.5 py-0.5 rounded-full flex-shrink-0">🔄 振替</span>}
              {r.isCardWithdrawal && <span className="text-xs bg-gray-200 text-gray-500 px-1.5 py-0.5 rounded-full flex-shrink-0">💳 取込済み</span>}
              {r.isCardWarning    && <span className="text-xs bg-amber-100 text-amber-600 px-1.5 py-0.5 rounded-full flex-shrink-0">💳 カード未取込?</span>}
              {r.ocrDuplicate     && <span className="text-xs bg-amber-100 text-amber-600 px-1.5 py-0.5 rounded-full flex-shrink-0">📷 OCR重複?</span>}
            </div>
            {r.ocrDuplicate && <p className="text-xs text-gray-400 mt-0.5">OCR:「{r.ocrDuplicate.label}」と重複の可能性</p>}
            <div className="flex items-center gap-1.5 mt-1 flex-wrap">
              <p className="text-xs text-gray-400">{r.date}</p>
              {r.category && (
                <span className={`text-xs px-1.5 py-0.5 rounded-full flex-shrink-0 border ${
                  r.category === "その他"
                    ? "bg-gray-100 text-gray-400 border-gray-200"
                    : "bg-emerald-50 text-emerald-700 border-emerald-200 font-medium"
                }`}>
                  {categories.find(c => c.name === r.category)?.emoji} {r.category}
                </span>
              )}
              <span className={`text-xs px-1.5 py-0.5 rounded-full flex-shrink-0 border font-medium ${shareCfg[2]}`}>
                {shareCfg[0]} {shareCfg[1]}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <p className={`text-sm font-bold ${(r.isDuplicate||r.isTransfer) ? "text-gray-400" : r.type === "income" ? "text-emerald-500" : "text-rose-500"}`}>
              {r.type === "income" ? "+" : "-"}{fmtCurrency(r.amount)}
            </p>
            <button onClick={e => { e.stopPropagation(); setCsvEditIdx(csvEditIdx === i ? null : i); }} className="text-gray-300 text-xs">✏️</button>
          </div>
        </div>
        {csvEditIdx === i && (
          <div className="px-4 pb-4 space-y-3 bg-gray-50 border-t border-gray-100">
            <div className="grid grid-cols-2 gap-2">
              <div><p className="text-xs text-gray-400 mb-1">店舗名</p><input type="text" value={r.label} onChange={e => updateCsvRow(i, "label", e.target.value)} className="w-full text-xs px-2 py-1.5 bg-white border border-gray-200 rounded-lg outline-none" /></div>
              <div><p className="text-xs text-gray-400 mb-1">金額</p><input type="number" value={Math.abs(r.amount)} onChange={e => updateCsvRow(i, "amount", r.type === "expense" ? -Number(e.target.value) : Number(e.target.value))} className="w-full text-xs px-2 py-1.5 bg-white border border-gray-200 rounded-lg outline-none" /></div>
              <div className="col-span-2"><p className="text-xs text-gray-400 mb-1">日付</p><input type="date" value={r.date} onChange={e => updateCsvRow(i, "date", e.target.value)} className="w-full text-xs px-2 py-1.5 bg-white border border-gray-200 rounded-lg outline-none" /></div>
            </div>
            {/* カテゴリー個別変更 */}
            <div>
              <p className="text-xs text-gray-400 mb-2">カテゴリー</p>
              <div className="flex flex-wrap gap-1.5">
                {categories.filter(c => c.type === (r.type || "expense")).map(c => (
                  <button key={c.id}
                    onClick={() => updateCsvRow(i, "category", c.name)}
                    className={`px-2 py-1 rounded-full text-xs font-semibold border transition-all ${
                      r.category === c.name ? "bg-indigo-500 text-white border-indigo-500" : "bg-white text-gray-600 border-gray-200"
                    }`}>
                    {c.emoji} {c.name}
                  </button>
                ))}
              </div>
            </div>
            {/* 種別個別変更 */}
            {r.type === "expense" && (
              <div>
                <p className="text-xs text-gray-400 mb-1.5">種別</p>
                <div className="flex gap-1.5 flex-wrap">
                  {[["shared","🤝 共有","bg-indigo-500"],["personal","👤 個人","bg-rose-400"],["partner","👥 相手","bg-purple-500"]].map(([val,lb,color]) => (
                    <button key={val} onClick={() => updateCsvRow(i, "shareType", val)}
                      className={`px-2.5 py-1 rounded-full text-xs font-semibold border transition-all ${
                        (r.shareType || defaultShareType) === val ? `${color} text-white border-transparent` : "bg-white text-gray-500 border-gray-200"
                      }`}>{lb}</button>
                  ))}
                </div>
              </div>
            )}
            <button onClick={() => setCsvEditIdx(null)} className="text-xs text-indigo-500 font-semibold">完了 ✓</button>
          </div>
        )}
      </div>
    );
  };

  const handleFileInput = async (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    setCsvPdfLoading(true);
    try {
      // フォーマット別のデフォルトshareTypeを取得（ループ外で定義）
      const csvDefaultShares = (() => { try { return JSON.parse(localStorage.getItem("kakeibo_csv_default_share") || "{}"); } catch { return {}; } })();
      let allRows = [];
      const detectedLabels    = new Set();
      const detectedFormatIds = new Set();
      const errors = [];

      for (const file of files) {
        const isPDF = file.name.toLowerCase().endsWith(".pdf");
        const isCSV = file.name.toLowerCase().endsWith(".csv");
        if (isPDF) {
          if (geminiKey) {
            try {
              const { cardName, transactions } = await analyzePDFWithGemini(file, geminiKey, () => {});
              detectedLabels.add(`${cardName}（PDF・Gemini）`);
              allRows = [...allRows, ...transactions];
              // Gemini PDFのカード名からsrcIdを推定してimportHistory用に追加
              const geminiCardToSrcId = {
                "エポスカード": "epos", "三井住友": "smbc", "楽天カード": "rakuten",
                "リクルートカード": "recruit", "住信SBI": "sbi",
              };
              const srcId = Object.entries(geminiCardToSrcId).find(([k]) => cardName.includes(k))?.[1];
              if (srcId) detectedFormatIds.add(srcId);
            } catch (err) { errors.push(`${file.name}: ${err.message}`); }
          } else {
            try {
              const { transactions, format } = await parsePDF(file);
              detectedLabels.add(PDF_FORMAT_LABELS[format] || format);
              allRows = [...allRows, ...transactions];
              // PDFフォーマットIDをimportHistory用に変換（epos_pdf→epos等）
              const pdfToSrcId = { epos_pdf: "epos", smbc_pdf: "smbc", rakuten_pdf: "rakuten" };
              const srcId = pdfToSrcId[format];
              if (srcId) detectedFormatIds.add(srcId);
            } catch { errors.push(`${file.name}: PDFの読み込みにはGeminiキーの設定を推奨します`); }
          }
        } else if (isCSV) {
          const text = await readCSVFile(file);
          const detected = detectCSVFormat(text);
          const formatToUse = detected !== "generic" ? detected : csvFormat;
          if (detected !== "generic") { detectedLabels.add(CSV_FORMATS[detected]?.label || detected); detectedFormatIds.add(detected); }
          const activeCsvSources = props_activeCsvSources || (() => { try { const s = localStorage.getItem(STORAGE_KEYS.ACTIVE_CSV_SOURCES); return s ? JSON.parse(s) : null; } catch { return null; } })();
          const allCatRules = [...(typeof learnedRules !== "undefined" ? learnedRules : []), ...DEFAULT_CATEGORY_RULES];
          allRows = [...allRows, ...parseCSVText(text, formatToUse, importHistory || {}, activeCsvSources, allCatRules)];
        }
      }

      if (errors.length) alert(errors.join("\n"));

      const seenKeys = new Set();
      allRows = allRows.filter(r => { const k = DUPLICATE_KEY(r); if (seenKeys.has(k)) return false; seenKeys.add(k); return true; });

      setCsvDetected([...detectedLabels].join(" / ") || "generic");
      setCsvFormatIds([...detectedFormatIds]);

      const existKeys = new Set(existingTransactions.map(DUPLICATE_KEY));
      // 店舗名類似チェック（先頭4文字以上一致で関連あり）
      // ocrCorrectionsを使ったラベル正規化（学習データで表記ゆれを解決）
      // 例: "Every BIGDAY 長沼店" → "エブリィビッグデー 長沼店" に変換してから比較
      const resolveLabel = (rawLabel) => {
        if (!rawLabel || !ocrCorrections) return rawLabel;
        const lower = rawLabel.toLowerCase().trim();
        // 完全一致
        if (ocrCorrections[rawLabel]) return ocrCorrections[rawLabel].label;
        // 大文字小文字無視一致
        for (const [k, v] of Object.entries(ocrCorrections)) {
          if (k.toLowerCase().trim() === lower) return v.label;
        }
        // 部分一致（3文字以上）
        for (const [k, v] of Object.entries(ocrCorrections)) {
          const kl = k.toLowerCase().trim();
          if (kl.length >= 3 && (lower.includes(kl) || kl.includes(lower))) return v.label;
        }
        return rawLabel;
      };

      const labelSimilar = (a, b) => {
        if (!a || !b) return false;
        // 学習データで表記ゆれを解決してから比較
        const ra = resolveLabel(a);
        const rb = resolveLabel(b);
        const norm = s => s.toLowerCase().replace(/[　\s・．.\/（）()「」／]/g, "");
        // 解決済みラベルで比較（aの解決 vs b、a vs bの解決、解決済み同士）
        const pairs = [[norm(a), norm(b)], [norm(ra), norm(b)], [norm(a), norm(rb)], [norm(ra), norm(rb)]];
        for (const [na, nb] of pairs) {
          if (!na || !nb) continue;
          // 1. 完全一致
          if (na === nb) return true;
          // 2. 先頭3文字以上の一致
          const minLen = Math.min(na.length, nb.length, 4);
          if (minLen >= 3 && na.slice(0, minLen) === nb.slice(0, minLen)) return true;
          // 3. 短い方の先頭3文字が長い方に含まれる（部分一致）
          const shorter = na.length <= nb.length ? na : nb;
          const longer  = na.length <= nb.length ? nb : na;
          if (shorter.length >= 3 && longer.includes(shorter.slice(0, 3))) return true;
        }
        return false;
      };

      // 既存取引との重複チェック
      // 条件1: 同日 + 金額完全一致 → ラベル問わず重複とみなす（英字/カタカナ表記ゆれ対応）
      // 条件2: 同日±1日 + 金額±5% + ラベル類似（念のため）
      const findOcrDups = (row) => {
        const amt = Math.abs(row.amount); const dateObj = new Date(row.date);
        return existingTransactions.filter(tx => {
          if (amt === 0) return false;
          const txAmt = Math.abs(tx.amount);
          if (txAmt === 0) return false;
          const diffDays = Math.abs(new Date(tx.date) - dateObj) / 86400000;
          // 条件1: 同日 + 金額完全一致（表記ゆれ・英字/カタカナ違いも検出）
          if (diffDays === 0 && txAmt === amt) return true;
          // 条件2: ±1日 + 金額±5% + ラベル類似
          if (diffDays > 1) return false;
          if (Math.abs(txAmt - amt) / Math.max(txAmt, amt) > 0.05) return false;
          return labelSimilar(row.label, tx.label);
        });
      };
      const findOcrDup = (row) => { const r = findOcrDups(row); return r.length > 0 ? r[0] : null; };

      const withDup = allRows.map(r => {
        const isDup  = existKeys.has(DUPLICATE_KEY(r));
        const dups   = !isDup ? findOcrDups(r) : [];
        return { ...r, isDuplicate: isDup, ocrDuplicate: dups[0] || null, ocrDuplicates: dups };
      });
      const init = {};
      withDup.forEach((r, i) => {
        if (r.isDuplicate || r.isTransfer || r.isCardWithdrawal || r.isCardWarning) {
          init[i] = false;
        } else if (r.ocrDuplicates?.length > 0) {
          init[i] = false; // OCR重複はocrActionsで管理
        } else {
          init[i] = true;  // カテゴリ問わず全てデフォルトON
        }
      });
      // OCR重複行のデフォルトを"both"（両方残す）に設定
      const initOcrActions = {};
      withDup.forEach((r, i) => {
        if (r.ocrDuplicates?.length > 0) initOcrActions[i] = "skip";
      });
      setOcrActions(initOcrActions);
      // 「その他」カテゴリの件数をカウントしてユーザーに通知
      const uncategorizedCount = withDup.filter(r => r.category === "その他" && !r.isDuplicate && !r.isTransfer && !r.isCardWithdrawal).length;
      if (uncategorizedCount > 0) {
        console.log(`[CSV] 未分類: ${uncategorizedCount}件`);
      }
      const uncatCount = withDup.filter(r => r.category === "その他" && !r.isDuplicate && !r.isTransfer && !r.isCardWithdrawal).length;
      // フォーマット別デフォルトshareTypeをwithDupに適用
      const withShareType = withDup.map(r => {
        if (r.shareType && r.shareType !== "shared") return r; // 既に設定済みはスキップ
        const fmtId = csvFormatIds[0] || csvFormat;
        const defaultShare = csvDefaultShares[fmtId];
        return defaultShare ? { ...r, shareType: defaultShare } : r;
      });
      setCsvRows(withShareType); setCsvChecked(init);
      if (uncatCount > 0) console.log(`[CSV] 未分類 ${uncatCount}件`);
      setCsvStep(allRows.length === 0 ? "empty" : "preview");
    } catch (e) {
      const msg = e?.message || "";
      if (msg.includes("対応していないPDF")) {
        alert("❌ 対応外のPDFです\nエポスカード・三井住友カードのPDFのみ対応しています");
      } else if (msg.includes("取引データを抽出できませんでした")) {
        alert("⚠️ PDFから取引データを読み取れませんでした\n\n考えられる原因：\n・ChromeまたはBraveでPDFを作成してください\n・設定→データ取得→三井住友カードの手順を確認");
      } else if (msg.includes("PDF.js") || msg.includes("読み込みに失敗")) {
        alert("⚠️ PDFの読み込みに失敗しました\n\n別の方法で試してください：\n・ChromeまたはBraveで明細を開く\n・印刷用ページ→PDFを作成→ファイルに保存");
      } else if (msg.includes("Shift_JIS") || msg.includes("encoding")) {
        alert("⚠️ 文字コードの変換に失敗しました\nブラウザを変えて再試行してください");
      } else {
        alert(`⚠️ ファイルの読み込みに失敗しました\n\nエラー: ${msg.slice(0, 100) || "不明なエラー"}\n\nファイルが正しい形式か確認してください`);
      }
    }
    finally { setCsvPdfLoading(false); }
  };

  const execCSVImport = () => {
    const toImport  = csvRows.filter((_, i) => csvChecked[i]);
    const expTotal  = toImport.filter(r => r.type === "expense").reduce((s, r) => s + Math.abs(r.amount), 0);
    const incTotal  = toImport.filter(r => r.type === "income").reduce((s, r) => s + r.amount, 0);
    const payPayAccount = (pointAccounts || []).find(a => a.name === "PayPay");
    const isPayPay  = csvDetected?.includes("PayPay") || csvDetected?.includes("paypay");

    toImport.forEach(r => {
      const enriched  = isPayPay && payPayAccount ? { ...r, pointAccountId: payPayAccount.id, paymentMethod: payPayAccount.id, csvFormatId: "paypay" } : r;
      const cleaned   = r.isCardWarning ? { ...enriched, isTransfer: false, isCardWithdrawal: false, isCardWarning: false } : enriched;
      const withPayer = cleaned.type === "expense"
        ? { ...cleaned, paidBy: selfId, shareType: cleaned.shareType || defaultShareType }
        : cleaned;

      if (r.isPointCharge && payPayAccount) {
        onAdd(createTransaction({ ...r, type: "expense", amount: -Math.abs(r.amount), pointAccountId: payPayAccount.id, paymentMethod: payPayAccount.id, shareType: "personal", paidBy: selfId, isTransfer: false, source: "csv", csvFormatId: "paypay" }));
      } else if (r.ocrDuplicates?.length > 0) {
        const action = ocrActions[r._csvIdx] || "skip";
        if (action === "skip") {
          // スキップ: 何もしない（OCRをそのまま残す）
        } else if (action === "replace") {
          // 置き換え: OCRを削除してCSVを取り込む
          r.ocrDuplicates.forEach(ocrTx => onDelete?.(ocrTx.id));
          const ocrTx = r.ocrDuplicates[0];
          onAdd(createTransaction({ ...withPayer, items: ocrTx.items || [], category: ocrTx.category || withPayer.category, shareType: withPayer.shareType, paidBy: selfId, source: "csv", csvFormatId: r.csvFormatId || csvFormatIds[0] || csvFormat || null }));
        } else {
          // both: OCRはそのまま残してCSVも追加
          onAdd(createTransaction({ ...withPayer, source: "csv", csvFormatId: r.csvFormatId || csvFormatIds[0] || csvFormat || null }));
        }
      } else {
        onAdd(createTransaction({ ...withPayer, source: "csv", csvFormatId: r.csvFormatId || csvFormatIds[0] || csvFormat || null }));
      }
      if (r.label && r.category) onLearnRule?.(r.label, r.category, r.type || "expense");
    });

    setCsvSummary({ count: toImport.length, skipped: csvRows.length - toImport.length, expTotal, incTotal });
    setCsvStep("done");

    if (csvFormatIds.length > 0) {
      // 全件重複でも「取り込み操作をした」事実を記録する
      // toImportが0件でもcsvRows（読み込み済み全行）から月を取得する
      const targetRows = toImport.length > 0 ? toImport : csvRows;
      const months  = [...new Set(targetRows.map(r => r.date).filter(Boolean).sort().map(d => d.slice(0, 7)))];
      if (months.length === 0) {
        // 月が取得できない場合は今月を使う
        const now = new Date();
        months.push(`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}`);
      }
      const newHist = { ...(importHistory || {}) };
      const importedAt = new Date().toISOString();
      csvFormatIds.forEach(fmtId => months.forEach(ym => { newHist[`${fmtId}_${ym}`] = importedAt; }));
      onImportHistoryChange?.(newHist);
      try {
        const current = new Set(props_activeCsvSources || ["sbi","epos","smbc","paypay"]);
        let updated = false;
        csvFormatIds.forEach(fmtId => { if (!current.has(fmtId)) { current.add(fmtId); updated = true; } });
        if (updated) onActiveCsvSourcesChange?.([...current]);
        // localStorageにも後方互換で書く
        localStorage.setItem(STORAGE_KEYS.ACTIVE_CSV_SOURCES, JSON.stringify([...current]));
      } catch {}
    }
  };

  return (
    <div className="pb-20">
      <div className="bg-white px-4 pt-12 pb-4 border-b border-gray-100 flex items-center gap-3">
        <button onClick={() => { onBack(); setCsvStep("upload"); }} className="text-gray-400 text-lg">←</button>
        <h1 className="text-xl font-bold text-gray-900">CSV / PDFインポート</h1>
      </div>
      <div className="px-4 py-5">

        {csvStep === "upload" && (
          <div className="space-y-4">
            <input ref={fileRef} type="file" accept=".csv,.pdf" multiple onChange={handleFileInput} className="hidden" />
            {csvPdfLoading ? (
              <div className="w-full py-10 rounded-2xl border-2 border-indigo-200 bg-indigo-50 flex flex-col items-center gap-3">
                <div className="w-10 h-10 border-4 border-indigo-200 border-t-indigo-500 rounded-full animate-spin" />
                <p className="text-sm font-bold text-indigo-600">読み込み中...</p>
                <p className="text-xs text-indigo-400">PDFは少し時間がかかります</p>
              </div>
            ) : (
              <button onClick={() => fileRef.current?.click()} className="w-full py-10 rounded-2xl border-2 border-dashed border-indigo-300 bg-indigo-50 flex flex-col items-center gap-3">
                <span className="text-5xl">📂</span>
                <p className="text-sm font-bold text-indigo-600">CSV / PDFを選択（複数同時OK）</p>
                <div className="flex gap-2">
                  <span className="text-xs bg-indigo-100 text-indigo-600 px-2 py-0.5 rounded-full font-medium">CSV</span>
                  <span className="text-xs bg-rose-100 text-rose-600 px-2 py-0.5 rounded-full font-medium">PDF</span>
                </div>
                <p className="text-xs text-indigo-400">フォーマットは自動で判定します</p>
              </button>
            )}
            <button onClick={() => setCsvShowOverride(p => !p)} className="w-full text-xs text-gray-400 flex items-center justify-center gap-1 py-1">
              ⚙️ フォーマットを手動で選ぶ {csvShowOverride ? "▲" : "▼"}
            </button>
            {csvShowOverride && (
              <div className="bg-gray-50 rounded-xl p-3 border border-gray-200 space-y-2">
                {Object.entries(CSV_FORMATS).map(([id, f]) => (
                  <button key={id} onClick={() => setCsvFormat(id)}
                    className={`w-full text-left p-3 rounded-xl border transition-all ${csvFormat === id ? "border-indigo-400 bg-indigo-50" : "border-gray-200 bg-white"}`}>
                    <p className="text-sm font-semibold text-gray-800">{f.label}</p>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {f.sampleColumns.map(c => <span key={c} className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full font-mono">{c}</span>)}
                    </div>
                  </button>
                ))}
              </div>
            )}
            <div className="bg-gray-50 rounded-xl p-3 border border-gray-200 space-y-2">
              <p className="text-xs font-semibold text-gray-500">✅ CSV自動対応</p>
              <div className="flex flex-wrap gap-1.5">{Object.values(CSV_FORMATS).map(f => <span key={f.label} className="text-xs bg-white border border-gray-200 text-gray-600 px-2 py-1 rounded-full">{f.label}</span>)}</div>
              <p className="text-xs font-semibold text-gray-500 mt-2">{geminiKey ? "✅ PDF対応（Gemini）" : "⚠️ PDF: Geminiキーで対応可"}</p>
              {!geminiKey && <p className="text-xs text-gray-400">OCRレシート画面でGeminiキーを設定するとPDFも読み込めます</p>}
            </div>
          </div>
        )}

        {csvStep === "empty" && (
          <div className="space-y-4">
            <div className="bg-amber-50 rounded-2xl p-5 border border-amber-200 text-center">
              <p className="text-3xl mb-3">🔍</p>
              <p className="text-sm font-bold text-amber-700 mb-2">0件でした</p>
              <p className="text-xs text-amber-600 leading-relaxed">選択したフォーマットがCSVと合っていない可能性があります。</p>
            </div>
            <PrimaryButton onClick={() => setCsvStep("upload")} variant="ghost">← 戻る</PrimaryButton>
          </div>
        )}

        {csvStep === "preview" && (
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <p className="text-sm font-bold text-gray-700">{csvRows.length}件を読み込みました</p>
              <button onClick={() => { setCsvStep("upload"); setCsvDetected(null); }} className="text-xs text-gray-400 underline">← 戻る</button>
            </div>

            {csvDetected && (
              <div className={`rounded-xl px-3 py-2 border flex items-center gap-2 ${csvDetected !== "generic" ? "bg-emerald-50 border-emerald-200" : "bg-amber-50 border-amber-200"}`}>
                <span className="text-sm">{csvDetected !== "generic" ? "✅" : "⚠️"}</span>
                <p className="text-xs font-semibold text-gray-700">
                  {csvDetected !== "generic" ? `自動判定: ${CSV_FORMATS[csvDetected]?.label || csvDetected}` : "フォーマット不明（汎用モードで処理）"}
                </p>
              </div>
            )}

            <div className="grid grid-cols-3 gap-2">
              <div className="bg-gray-50 rounded-xl p-2.5 text-center border border-gray-100"><p className="text-lg font-bold text-gray-800">{csvRows.filter((r, i) => csvChecked[i] && r.category === "その他" && !isDupRow(r)).length}</p><p className="text-xs text-gray-400 mt-0.5">未分類</p></div>
              <div className="bg-emerald-50 rounded-xl p-2.5 text-center border border-emerald-100"><p className="text-lg font-bold text-emerald-600">{csvRows.filter((r, i) => csvChecked[i] && r.category !== "その他" && !isDupRow(r)).length}</p><p className="text-xs text-emerald-400 mt-0.5">適用済み</p></div>
              <div className="bg-gray-100 rounded-xl p-2.5 text-center border border-gray-200"><p className="text-lg font-bold text-gray-400">{csvRows.filter(r => isDupRow(r)).length}</p><p className="text-xs text-gray-400 mt-0.5">重複</p></div>
            </div>

            {/* カテゴリ一括変更パネル */}
            <div className="bg-indigo-50 rounded-xl p-3 border border-indigo-100">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-semibold text-indigo-600">🏷️ カテゴリを一括変更</p>
                <div className="flex gap-2">
                  <button onClick={() => { const n = {}; csvRows.forEach((r, i) => n[i] = !isDupRow(r)); setCsvChecked(n); }} className="text-xs text-indigo-500 font-semibold bg-white px-2 py-1 rounded-lg border border-indigo-200">全ON</button>
                  <button onClick={() => { const n = {}; csvRows.forEach((_, i) => n[i] = false); setCsvChecked(n); }} className="text-xs text-gray-500 font-semibold bg-white px-2 py-1 rounded-lg border border-gray-200">全OFF</button>
                </div>
              </div>
              <p className="text-xs text-gray-500 font-semibold mb-1">💸 支出</p>
              <div className="flex flex-wrap gap-1.5 mb-2">
                {categories.filter(c => c.type === "expense").map(cat => (
                  <button key={cat.id}
                    onClick={() => setCsvRows(p => p.map((r, i) => csvChecked[i] ? { ...r, category: cat.name } : r))}
                    className="px-2.5 py-1 bg-white rounded-lg text-xs border border-indigo-200 text-gray-600 hover:bg-indigo-500 hover:text-white hover:border-indigo-500 transition-all">
                    {cat.emoji} {cat.name}
                  </button>
                ))}
              </div>
              <p className="text-xs text-gray-500 font-semibold mb-1">💰 収入（PayPay戻り等）</p>
              <div className="flex flex-wrap gap-1.5">
                {categories.filter(c => c.type === "income").map(cat => (
                  <button key={cat.id}
                    onClick={() => setCsvRows(p => p.map((r, i) => !csvChecked[i] ? r : { ...r, category: cat.name, type: "income", amount: Math.abs(r.amount) }))}
                    className="px-2.5 py-1 bg-white rounded-lg text-xs border border-emerald-200 text-gray-600 hover:bg-emerald-500 hover:text-white hover:border-emerald-500 transition-all">
                    {cat.emoji} {cat.name}
                  </button>
                ))}
              </div>
              <p className="text-xs text-indigo-400 mt-1.5">チェックした件を選択→カテゴリボタンで変更</p>
            </div>

            {/* 種別一括変更パネル */}
            <div className="bg-indigo-50 rounded-xl p-3 border border-indigo-100">
              <p className="text-xs font-semibold text-indigo-600 mb-2">🔖 種別を一括変更</p>
              <div className="flex flex-wrap gap-1.5">
                {[["shared","🤝 共有","bg-indigo-500"],["personal","👤 個人","bg-rose-400"],["partner","👥 相手","bg-purple-500"]].map(([val, lb, bg]) => (
                  <button key={val}
                    onClick={() => setCsvRows(p => p.map((r, i) => csvChecked[i] && r.type === "expense" ? { ...r, shareType: val } : r))}
                    className={`px-2.5 py-1 ${bg} text-white rounded-lg text-xs font-semibold transition-all`}>
                    {lb}
                  </button>
                ))}
              </div>
              <p className="text-xs text-indigo-400 mt-1.5">チェックした支出行の種別を一括変更</p>
            </div>

            {/* 取引リスト */}
            <div className="bg-white rounded-xl overflow-hidden border border-gray-100">
              {(() => {
                const shareOrder = { shared: 0, personal: 1, partner: 2 };
                const sortByShareType = (entries) =>
                  [...entries].sort((a, b) => {
                    const stA = shareOrder[a[0].shareType || defaultShareType] ?? 0;
                    const stB = shareOrder[b[0].shareType || defaultShareType] ?? 0;
                    return stA - stB;
                  });

                const importRows  = csvRows.map((r, i) => [r, i]).filter(([r, i]) => csvChecked[i] && !isOcrOnlyDup(r));
                const confirmRows = csvRows.map((r, i) => [r, i]).filter(([r])    => isOcrOnlyDup(r));
                const skipRows    = csvRows.map((r, i) => [r, i]).filter(([r, i]) => !csvChecked[i] && !isOcrOnlyDup(r));

                return (
                  <>
                    {importRows.length > 0 && (
                      <div className="px-4 py-2 bg-emerald-50 border-b border-emerald-100">
                        <p className="text-xs font-semibold text-emerald-600">✅ インポート予定（{importRows.length}件）</p>
                      </div>
                    )}
                    {sortByShareType(importRows).map(([r, i]) => renderCsvRow(r, i))}

                    {confirmRows.length > 0 && (
                      <div className="px-4 py-2 bg-amber-50 border-t border-amber-100">
                        <p className="text-xs font-semibold text-amber-600">⚠️ 要確認（チェックでインポート可）</p>
                      </div>
                    )}
                    {sortByShareType(confirmRows).map(([r, i]) => renderCsvRow(r, i))}

                    {skipRows.length > 0 && (
                      <div className="px-4 py-2 bg-gray-100 border-t border-gray-200">
                        <p className="text-xs font-semibold text-gray-400">⬜ スキップ予定（チェックで変更可）</p>
                      </div>
                    )}
                    {sortByShareType(skipRows).map(([r, i]) => renderCsvRow(r, i))}
                  </>
                );
              })()}
            </div>

            <PrimaryButton onClick={execCSVImport}>✅ {csvRows.filter((r, i) => csvChecked[i]).length}件をインポート</PrimaryButton>
          </div>
        )}

        {csvStep === "done" && csvSummary && (
          <div className="space-y-4 py-6">
            <div className="text-center"><div className="text-5xl mb-3">✅</div><h2 className="text-xl font-bold text-gray-900">インポート完了！</h2></div>
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-indigo-50 rounded-2xl p-3 border border-indigo-100 text-center"><p className="text-2xl font-bold text-indigo-600">{csvSummary.count}</p><p className="text-xs text-indigo-400 mt-1">インポート件数</p></div>
              <div className="bg-gray-50 rounded-2xl p-3 border border-gray-200 text-center"><p className="text-2xl font-bold text-gray-500">{csvSummary.skipped}</p><p className="text-xs text-gray-400 mt-1">スキップ（重複）</p></div>
              <div className="bg-rose-50 rounded-2xl p-3 border border-rose-100 text-center"><p className="text-sm font-bold text-rose-600">{fmtCurrency(csvSummary.expTotal)}</p><p className="text-xs text-rose-400 mt-1">支出合計</p></div>
              <div className="bg-emerald-50 rounded-2xl p-3 border border-emerald-100 text-center"><p className="text-sm font-bold text-emerald-600">{fmtCurrency(csvSummary.incTotal)}</p><p className="text-xs text-emerald-400 mt-1">収入合計</p></div>
            </div>
            <PrimaryButton onClick={() => { setCsvStep("upload"); onBack(); }}>ホームに戻る</PrimaryButton>
          </div>
        )}
      </div>
    </div>
  );
}
