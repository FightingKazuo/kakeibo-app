import { useState, useRef } from "react";
import { fmtCurrency } from "../../utils/format";
import { readCSVFile } from "../../services/csvParser";
import { loadStorage, saveStorage } from "../../utils/storage";

const ASSETS_KEY = "kakeibo_assets";

// ─── SBI証券CSVパーサー ───────────────────────────────────
const parseSBISecuritiesCSV = (text) => {
  const lines = text.split("\n").map(l => l.trim()).filter(Boolean);
  const funds = [];
  let totalEval = 0;
  let totalGain = 0;

  for (const line of lines) {
    const cols = line.split(",").map(c => c.replace(/^"|"$/g, "").trim());
    // ファンド名,保有口数,...,取得金額,評価額,評価損益,...
    if (cols.length >= 8 && cols[0].includes("ＳＬｉｍ") || cols[0].includes("eMAXIS") || cols[0].includes("Ｓｌｉｍ")) {
      const name    = cols[0].replace(/[Ａ-Ｚａ-ｚ０-９（）　]/g, c =>
        c.charCodeAt(0) > 0xFF00
          ? String.fromCharCode(c.charCodeAt(0) - 0xFEE0)
          : c
      ).trim();
      const evalAmt = parseInt(String(cols[6] || "0").replace(/[^0-9\-]/g, "")) || 0;
      const gainAmt = parseInt(String(cols[7] || "0").replace(/[^0-9\-\+]/g, "").replace("+","")) || 0;
      if (evalAmt > 0) {
        funds.push({ name, evalAmt, gainAmt });
        totalEval += evalAmt;
        totalGain += gainAmt;
      }
    }
    // 合計行
    if (cols[0] === "評価額合計" || (cols.length === 2 && !isNaN(parseInt(cols[0].replace(/,/g,""))))) {
      const v = parseInt(cols[0].replace(/[^0-9]/g,"")) || 0;
      const g = parseInt((cols[1]||"0").replace(/[^0-9\-\+]/g,"").replace("+","")) || 0;
      if (v > 1000000) { totalEval = v; totalGain = g; }
    }
  }
  return { funds, totalEval, totalGain };
};

// ─── 住信SBI残高パーサー ─────────────────────────────────
const parseSBIBankBalance = (text) => {
  const lines = text.split("\n").map(l => l.trim()).filter(Boolean);
  // ヘッダー行をスキップして1行目のデータ行を読む
  // 形式: 日付,内容,出金,入金,残高(円),メモ
  for (const line of lines) {
    const cols = line.split(",").map(c => c.replace(/^"|"$/g, "").trim());
    if (cols[0].match(/^\d{4}\/\d{2}\/\d{2}$/)) {
      // 最初のデータ行 = 最新残高
      const balance = parseInt(String(cols[4] || "0").replace(/[,，]/g, "")) || 0;
      const date    = cols[0].replace(/\//g, "-");
      if (balance > 0) return { balance, date };
    }
  }
  return null;
};

export function AssetsPage({ transactions, pointAccounts }) {
  const [assets,    setAssets]    = useState(() => loadStorage(ASSETS_KEY, {
    bankBalance:  null, // { balance, date }
    securities:   null, // { funds, totalEval, totalGain, date }
    ideco:        null, // { balance, date } - 後で追加
  }));
  const [loading,   setLoading]   = useState(false);
  const [activeTab, setActiveTab] = useState("overview");

  const bankFileRef  = useRef(null);
  const secFileRef   = useRef(null);

  // ── ファイル読み込み ──────────────────────────────────
  const handleBankFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLoading(true);
    try {
      const text   = await readCSVFile(file);
      const result = parseSBIBankBalance(text);
      if (result) {
        const newAssets = { ...assets, bankBalance: { ...result, updatedAt: new Date().toISOString() } };
        setAssets(newAssets);
        saveStorage(ASSETS_KEY, newAssets);
      } else {
        alert("残高を読み取れませんでした。住信SBIネット銀行のCSVか確認してください。");
      }
    } catch (e) {
      alert("読み込みエラー: " + e.message);
    } finally {
      setLoading(false);
    }
    e.target.value = "";
  };

  const handleSecFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLoading(true);
    try {
      const text   = await readCSVFile(file);
      const result = parseSBISecuritiesCSV(text);
      if (result.totalEval > 0) {
        const newAssets = { ...assets, securities: { ...result, updatedAt: new Date().toISOString() } };
        setAssets(newAssets);
        saveStorage(ASSETS_KEY, newAssets);
      } else {
        alert("証券データを読み取れませんでした。SBI証券のSaveFile.csvか確認してください。");
      }
    } catch (e) {
      alert("読み込みエラー: " + e.message);
    } finally {
      setLoading(false);
    }
    e.target.value = "";
  };

  // ── 計算 ─────────────────────────────────────────────
  const bankBalance  = assets.bankBalance?.balance  || 0;
  const secTotal     = assets.securities?.totalEval || 0;
  const secGain      = assets.securities?.totalGain || 0;
  const idecoBalance = assets.ideco?.balance        || 0;
  const pointTotal   = (pointAccounts || []).reduce((s, a) => s + Math.max(0, a.balance), 0);
  const totalAssets  = bankBalance + secTotal + idecoBalance;

  // ── 今月の銀行増減 ────────────────────────────────────
  const now       = new Date();
  const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const monthlyIncome  = (transactions || [])
    .filter(t => t.date?.startsWith(thisMonth) && t.type === "income")
    .reduce((s, t) => s + t.amount, 0);
  const monthlyExpense = (transactions || [])
    .filter(t => t.date?.startsWith(thisMonth) && t.type === "expense")
    .reduce((s, t) => s + t.amount, 0);
  const monthlyNet = monthlyIncome + monthlyExpense;

  const TABS = [
    { id: "overview",  label: "概要"    },
    { id: "bank",      label: "銀行"    },
    { id: "securities",label: "証券"    },
    { id: "ideco",     label: "iDeCo"  },
  ];

  return (
    <div className="pb-24">
      <div className="bg-white px-4 pt-12 pb-4 border-b border-gray-100">
        <h1 className="text-xl font-bold text-gray-900">資産状況</h1>
        <p className="text-xs text-gray-400 mt-0.5">
          最終更新：{assets.bankBalance?.updatedAt?.slice(0,10) || "未取得"}
        </p>
      </div>

      {/* タブ */}
      <div className="flex gap-1 px-4 py-3 overflow-x-auto">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setActiveTab(t.id)}
            className={`px-4 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-all ${
              activeTab === t.id ? "bg-indigo-500 text-white" : "bg-gray-100 text-gray-500"
            }`}>
            {t.label}
          </button>
        ))}
      </div>

      <div className="px-4 py-2 space-y-4">

        {/* ── 概要タブ ── */}
        {activeTab === "overview" && (
          <>
            {/* 合計資産カード */}
            <div className="bg-gradient-to-br from-indigo-500 to-purple-600 rounded-2xl p-5 text-white">
              <p className="text-xs font-semibold opacity-80 mb-1">合計資産</p>
              <p className="text-4xl font-bold tracking-tight">
                {fmtCurrency(totalAssets)}
              </p>
              <div className="flex gap-4 mt-3">
                <div>
                  <p className="text-xs opacity-70">証券含み益</p>
                  <p className={`text-sm font-bold ${secGain >= 0 ? "text-emerald-300" : "text-rose-300"}`}>
                    {secGain >= 0 ? "+" : ""}{fmtCurrency(secGain)}
                  </p>
                </div>
                <div>
                  <p className="text-xs opacity-70">今月収支</p>
                  <p className={`text-sm font-bold ${monthlyNet >= 0 ? "text-emerald-300" : "text-rose-300"}`}>
                    {monthlyNet >= 0 ? "+" : ""}{fmtCurrency(monthlyNet)}
                  </p>
                </div>
              </div>
            </div>

            {/* 内訳 */}
            <div className="bg-white rounded-2xl overflow-hidden border border-gray-100">
              {[
                { label:"住信SBIネット銀行", icon:"🏦", value: bankBalance,  sub: assets.bankBalance?.date || "未取得", color:"text-blue-600" },
                { label:"SBI証券（NISA）",   icon:"📈", value: secTotal,     sub: `含み益 ${secGain >= 0 ? "+" : ""}${fmtCurrency(secGain)}`, color:"text-emerald-600" },
                { label:"iDeCo",             icon:"🏛️", value: idecoBalance, sub: assets.ideco ? assets.ideco.date : "未取得", color:"text-purple-600" },
                { label:"ポイント合計",        icon:"⭐", value: pointTotal,   sub: `${(pointAccounts||[]).length}口座`, color:"text-amber-600" },
              ].map(item => (
                <div key={item.label} className="flex items-center justify-between px-4 py-3.5 border-b border-gray-50 last:border-b-0">
                  <div className="flex items-center gap-3">
                    <span className="text-xl">{item.icon}</span>
                    <div>
                      <p className="text-sm font-medium text-gray-800">{item.label}</p>
                      <p className="text-xs text-gray-400">{item.sub}</p>
                    </div>
                  </div>
                  <p className={`text-sm font-bold ${item.color}`}>{fmtCurrency(item.value)}</p>
                </div>
              ))}
            </div>

            {/* ファイル更新ボタン */}
            <div className="grid grid-cols-2 gap-3">
              <input ref={bankFileRef} type="file" accept=".csv" onChange={handleBankFile} className="hidden" />
              <button onClick={() => bankFileRef.current?.click()}
                className="py-3 bg-blue-50 border border-blue-200 rounded-xl text-xs font-semibold text-blue-600 flex flex-col items-center gap-1">
                <span className="text-xl">🏦</span>
                銀行残高を更新
              </button>
              <input ref={secFileRef} type="file" accept=".csv" onChange={handleSecFile} className="hidden" />
              <button onClick={() => secFileRef.current?.click()}
                className="py-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs font-semibold text-emerald-600 flex flex-col items-center gap-1">
                <span className="text-xl">📈</span>
                証券を更新
              </button>
            </div>
          </>
        )}

        {/* ── 銀行タブ ── */}
        {activeTab === "bank" && (
          <div className="space-y-4">
            <div className="bg-white rounded-2xl p-4 border border-gray-100">
              <div className="flex justify-between items-start mb-4">
                <div>
                  <p className="text-xs text-gray-400 font-semibold">住信SBIネット銀行</p>
                  <p className="text-3xl font-bold text-blue-600 mt-1">{fmtCurrency(bankBalance)}</p>
                  <p className="text-xs text-gray-400 mt-1">
                    {assets.bankBalance ? `${assets.bankBalance.date} 時点` : "未取得"}
                  </p>
                </div>
                <input ref={bankFileRef} type="file" accept=".csv" onChange={handleBankFile} className="hidden" />
                <button onClick={() => bankFileRef.current?.click()}
                  className="px-3 py-2 bg-blue-500 text-white rounded-xl text-xs font-semibold">
                  CSV更新
                </button>
              </div>
              <div className="grid grid-cols-2 gap-2 border-t border-gray-50 pt-3">
                <div className="bg-emerald-50 rounded-xl p-3 text-center">
                  <p className="text-xs text-emerald-500 font-semibold">今月入金</p>
                  <p className="text-lg font-bold text-emerald-600 mt-0.5">{fmtCurrency(monthlyIncome)}</p>
                </div>
                <div className="bg-rose-50 rounded-xl p-3 text-center">
                  <p className="text-xs text-rose-500 font-semibold">今月出金</p>
                  <p className="text-lg font-bold text-rose-600 mt-0.5">{fmtCurrency(Math.abs(monthlyExpense))}</p>
                </div>
              </div>
            </div>
            <div className="bg-amber-50 rounded-xl p-3 border border-amber-100">
              <p className="text-xs font-semibold text-amber-600 mb-1">📌 取得方法</p>
              <p className="text-xs text-amber-500 leading-relaxed">
                住信SBIネット銀行 → 入出金明細 → CSVダウンロード → ここで読み込み
              </p>
            </div>
          </div>
        )}

        {/* ── 証券タブ ── */}
        {activeTab === "securities" && (
          <div className="space-y-4">
            <div className="bg-white rounded-2xl p-4 border border-gray-100">
              <div className="flex justify-between items-start mb-3">
                <div>
                  <p className="text-xs text-gray-400 font-semibold">SBI証券（NISA）</p>
                  <p className="text-3xl font-bold text-emerald-600 mt-1">{fmtCurrency(secTotal)}</p>
                  <p className={`text-sm font-semibold mt-0.5 ${secGain >= 0 ? "text-emerald-500" : "text-rose-500"}`}>
                    含み益 {secGain >= 0 ? "+" : ""}{fmtCurrency(secGain)}
                  </p>
                </div>
                <input ref={secFileRef} type="file" accept=".csv" onChange={handleSecFile} className="hidden" />
                <button onClick={() => secFileRef.current?.click()}
                  className="px-3 py-2 bg-emerald-500 text-white rounded-xl text-xs font-semibold">
                  CSV更新
                </button>
              </div>
            </div>

            {/* 銘柄一覧 */}
            {assets.securities?.funds?.length > 0 && (
              <div className="bg-white rounded-2xl overflow-hidden border border-gray-100">
                <div className="px-4 py-3 border-b border-gray-50">
                  <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">保有銘柄</p>
                </div>
                {assets.securities.funds.map((f, i) => (
                  <div key={i} className="px-4 py-3 border-b border-gray-50 last:border-b-0">
                    <p className="text-xs font-medium text-gray-800 leading-snug">{f.name}</p>
                    <div className="flex justify-between mt-1">
                      <p className="text-sm font-bold text-gray-700">{fmtCurrency(f.evalAmt)}</p>
                      <p className={`text-xs font-semibold ${f.gainAmt >= 0 ? "text-emerald-500" : "text-rose-500"}`}>
                        {f.gainAmt >= 0 ? "+" : ""}{fmtCurrency(f.gainAmt)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {!assets.securities && (
              <div className="bg-gray-50 rounded-2xl p-6 text-center border border-gray-100">
                <p className="text-3xl mb-2">📊</p>
                <p className="text-sm font-semibold text-gray-600">SBI証券のデータ未取得</p>
                <p className="text-xs text-gray-400 mt-1">SaveFile.csvをアップロードしてください</p>
              </div>
            )}

            <div className="bg-amber-50 rounded-xl p-3 border border-amber-100">
              <p className="text-xs font-semibold text-amber-600 mb-1">📌 取得方法</p>
              <p className="text-xs text-amber-500 leading-relaxed">
                SBI証券 → 口座管理 → 保有証券一覧 → 「保存」ボタン → SaveFile.csvをアップロード
              </p>
            </div>
          </div>
        )}

        {/* ── iDeCoタブ ── */}
        {activeTab === "ideco" && (
          <div className="space-y-4">
            <div className="bg-purple-50 rounded-2xl p-5 border border-purple-100 text-center">
              <p className="text-3xl mb-2">🏛️</p>
              <p className="text-sm font-semibold text-purple-700">iDeCo設定待ち</p>
              <p className="text-xs text-purple-400 mt-1 leading-relaxed">
                iDeCoのCSVファイルを確認後に対応します
              </p>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
