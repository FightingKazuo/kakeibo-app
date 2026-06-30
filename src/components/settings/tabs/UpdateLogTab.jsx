import { useState, useEffect } from "react";

const STORAGE_KEY = "kakeibo_test_checklist";

const loadChecked = () => {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}"); } catch { return {}; }
};
const saveChecked = (obj) => {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(obj)); } catch {}
};

// ============================================================
// アップデート履歴データ
// セッション単位（家計簿アプリ1〜4 + 直近セッション）でまとめ
// ============================================================
const SESSIONS = [
  {
    id: "s1",
    title: "セッション1：基盤構築",
    versionRange: "v1.x 〜 v2.0",
    items: [
      { text: "React + Vite + Tailwind + Vercel構成を確立", test: null },
      { text: "OCR.space + Gemini のハイブリッドOCR方式を採用", test: "レシートをOCRで読み込み、品目が正しく認識されるか" },
      { text: "店舗名の修正学習システム（saveCorrection/lookupCorrection）", test: "OCRで認識ミスした店名を修正→次回同じ店で自動的に正しい名前になるか" },
      { text: "三井住友カードCSVのShift-JIS検出バグ修正", test: "三井住友カードCSVをインポートして文字化けしないか" },
      { text: "detectCSVFormat関数追加（フォーマット自動判定）", test: "CSVをアップロードした時にフォーマットを手動選択せず自動判定されるか" },
      { text: "複数ファイル同時アップロード対応", test: "2つ以上のCSV/PDFを同時に選択してインポートできるか" },
    ],
  },
  {
    id: "s2",
    title: "セッション2：CSV消し込み・精算計算修正",
    versionRange: "v2.x 〜 v2.7.6",
    items: [
      { text: "CSV「消し込み」方式（分類後に自動チェックOFF）", test: "CSVインポートでカテゴリを割り当てると自動でチェックが外れるか" },
      { text: "取引リストに長押し選択モード・一括操作機能", test: "取引一覧で長押し→複数選択→一括カテゴリ変更ができるか" },
      { text: "精算計算バグ修正（paidBy未設定取引の集計）", test: "支払者未設定の取引があっても精算タブの合計が正しいか" },
      { text: "PayPay対応（チャージ→収入、送金→個人支出）", test: "PayPay CSVをインポートしてチャージ・送金・受取が正しく分類されるか" },
    ],
  },
  {
    id: "s3",
    title: "セッション3：OCR精度向上・CSV管理画面",
    versionRange: "v2.7.7 〜 v3.0.8",
    items: [
      { text: "Gemini OCR v8（JSON強制・画像圧縮・トークン数増加）", test: "レシートOCRで品目の数量×単価が正確に計算されているか" },
      { text: "ウエルシア20日WAON特別対応（1.5倍ポイント）", test: "ウエルシアで20日に買い物した場合、精算金額が1.5で割られているか" },
      { text: "カテゴリ変更モードUI（チェック→カテゴリボタンで一括変更）", test: "品目を選択してカテゴリボタンを押すと一括変更されるか" },
      { text: "CSV管理画面（activeCsvSourcesでON/OFF管理）", test: "設定→CSV管理で使っていないカードをOFFにできるか" },
      { text: "RulesTab 4サブタブ化（学習/分類/カード対応/振替キーワード）", test: "設定→学習ルールの4つのサブタブが表示され切り替えられるか" },
    ],
  },
  {
    id: "s4",
    title: "セッション4：精算タブ改善・SMBC PDFパーサー",
    versionRange: "v3.0.0 〜 v3.1.2",
    items: [
      { text: "精算タブにチェックボックス選択UI・一括shareType変更", test: "精算タブで取引を選択して共有/個人/相手を一括変更できるか" },
      { text: "カード口座振替の自動スキップ分類", test: "住信SBI銀行CSVのカード引き落とし行が「カード口座振替」セクションに分類されるか" },
      { text: "BANK_CARD_MAPPING確立（エポス/三井住友/JCB）", test: "各カードの口座振替がそれぞれ正しく自動スキップされるか" },
      { text: "三井住友カードPDF対応（3パターンパーサー）", test: "三井住友カードPDFをインポートして取引が抽出されるか" },
      { text: "Amazon注文履歴CSV対応（Cancelled除外・重複排除）", test: "Amazon注文履歴CSVで、キャンセル分が除外され同一注文が重複しないか" },
      { text: "ルール管理のMarkdown化（kakeibo-rules.md）", test: null },
    ],
  },
  {
    id: "s5",
    title: "セッション5：SMBC PDFパーサー完成・予算機能",
    versionRange: "v3.1.x 〜 v3.5.x",
    items: [
      { text: "SMBC PDFパーサー完全書き直し（実データ4ヶ月分で精度100%確認）", test: "三井住友カードPDF（複数月）をインポートし、PDF記載の合計金額と一致するか" },
      { text: "OCR重複検出UI（スキップ/両方残す/置き換えの3択）", test: "OCRで取り込んだ取引と同じものをCSVで取り込んだ時、3択の選択肢が出るか" },
      { text: "カテゴリ自動学習システム", test: "同じ店名・カテゴリを何度か登録すると次回から自動的に分類されるか" },
      { text: "予算タブ追加（カテゴリ別進捗バー・80%/100%アラート）", test: "設定→予算でカテゴリ別に予算を設定し、ホーム画面に進捗バーが表示されるか" },
      { text: "csvSourceLabels / budgets のSupabase移行", test: "別の端末でログインしても予算設定・カード表示名が共有されているか" },
      { text: "CSVソース別デフォルトshareType設定", test: "CSV管理で「三井住友は個人がデフォルト」等を設定し、インポート時に反映されるか" },
      { text: "投資信託積立タブ追加（概算評価額表示）", test: "資産タブ→積立で銘柄を登録し、概算評価額が表示されるか" },
    ],
  },
  {
    id: "s6",
    title: "セッション6（直近）：パーサー総点検・重複検出強化",
    versionRange: "v3.6.0 〜 v3.6.x",
    items: [
      { text: "三井住友カードCSV新フォーマット対応（2026年6月以降の列構成変更）", test: "2026年6月以降に発行された三井住友カードCSVをインポートし、全件正しい金額・日付で取り込まれるか" },
      { text: "楽天カードPDF対応", test: "楽天カードPDFをインポートして取引が抽出されるか" },
      { text: "三井住友カードPDFの店名折り返しバグ修正", test: "三井住友カードPDFインポート後、PDF記載の合計金額とアプリの取込合計が一致するか" },
      { text: "PDFインポート時の取込履歴マーク漏れ修正", test: "PDFをインポートした後、ホーム画面の「CSV取り込み状況」に✅が付くか" },
      { text: "複数カード同時インポート時のcsvFormatId取り違え修正", test: "2種類以上のCSV/PDFを同時アップロードし、各取引に正しいカードバッジが付くか" },
      { text: "CSVインポート時のカテゴリ自動分類", test: "「ラクテンモバイル」等の既知キーワードを含む取引が自動的に正しいカテゴリになるか" },
      { text: "「（カ）ジエーシービー」のカード振替認識", test: "住信SBI銀行CSVの「口座振替　（カ）ジエーシービー」が自動スキップされるか" },
      { text: "「振込＊コバヤシ」入金の収入計上修正", test: "住信SBI銀行CSVで自分宛の振込入金が収入として取り込まれるか" },
      { text: "OCR/CSV表記ゆれによる重複検出漏れ修正（同日+金額一致条件追加）", test: "英語表記のOCR取引とカタカナ表記のCSV取引が「OCR重複」として検出されるか" },
      { text: "OCR重複時のデフォルトアクションを「スキップ」に変更", test: "OCR重複が検出された取引で何もせずインポートを押した場合、OCRのみ残るか" },
      { text: "取引一覧でのCSVカード別フィルター追加", test: "取引一覧→📊CSVフィルターを押すと、カード別サブフィルターが表示されるか" },
      { text: "CSVバッジ表示をカード名に変更（📊CSV SBI→📊SBI）", test: "取引一覧の各取引バッジが「📊SBI」「📊EPOS」のように表示されるか" },
    ],
  },
];

function CheckRow({ id, text, test, checked, onToggle }) {
  return (
    <div className="px-4 py-3 border-b border-gray-50 last:border-b-0">
      <div className="flex items-start gap-3">
        <button
          onClick={() => onToggle(id)}
          className={`w-5 h-5 rounded-md border-2 flex items-center justify-center flex-shrink-0 mt-0.5 transition-all ${
            checked ? "bg-emerald-500 border-emerald-500" : "bg-white border-gray-300"
          }`}>
          {checked && <span className="text-white text-xs">✓</span>}
        </button>
        <div className="flex-1 min-w-0">
          <p className={`text-sm ${checked ? "text-gray-400 line-through" : "text-gray-800"}`}>{text}</p>
          {test && (
            <p className="text-xs text-indigo-400 mt-1">✅ テスト: {test}</p>
          )}
        </div>
      </div>
    </div>
  );
}

export function UpdateLogTab() {
  const [checked, setChecked] = useState(loadChecked);
  const [openSessions, setOpenSessions] = useState(() => new Set([SESSIONS[SESSIONS.length - 1].id]));
  const [view, setView] = useState("checklist"); // "checklist" | "log"

  useEffect(() => { saveChecked(checked); }, [checked]);

  const toggle = (id) => setChecked(p => ({ ...p, [id]: !p[id] }));
  const toggleSession = (id) => setOpenSessions(p => {
    const next = new Set(p);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });

  // 全体の進捗
  const allTestable = SESSIONS.flatMap(s => s.items).filter(i => i.test);
  const totalChecked = allTestable.filter(i => checked[`${i.text}`]).length;
  const pct = allTestable.length > 0 ? Math.round((totalChecked / allTestable.length) * 100) : 0;

  const resetAll = () => {
    if (!window.confirm("チェック状態をすべてリセットしますか？")) return;
    setChecked({});
  };

  return (
    <div className="pb-6">
      {/* 表示切り替え */}
      <div className="flex gap-1.5 px-4 py-3">
        <button onClick={() => setView("checklist")}
          className={`flex-1 px-3 py-2 rounded-full text-xs font-semibold transition-all ${
            view === "checklist" ? "bg-indigo-500 text-white" : "bg-gray-100 text-gray-500"
          }`}>
          ✅ テストチェックリスト
        </button>
        <button onClick={() => setView("log")}
          className={`flex-1 px-3 py-2 rounded-full text-xs font-semibold transition-all ${
            view === "log" ? "bg-indigo-500 text-white" : "bg-gray-100 text-gray-500"
          }`}>
          📋 全体の変更点だけ見る
        </button>
      </div>

      {view === "checklist" && (
        <>
          {/* 進捗サマリー */}
          <div className="mx-4 mb-3 bg-white rounded-2xl p-4 border border-gray-100">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-semibold text-gray-500">動作確認の進捗</p>
              <span className="text-xs font-bold text-indigo-500">{totalChecked} / {allTestable.length}件</span>
            </div>
            <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
              <div className="h-full bg-indigo-400 rounded-full transition-all duration-300" style={{ width: `${pct}%` }} />
            </div>
            <p className="text-xs text-gray-400 mt-2">
              機能を変更した後はこのリストを上から流して、できなくなっていないか確認する運用です。
            </p>
            <button onClick={resetAll} className="text-xs text-rose-400 mt-2 font-semibold">
              すべてのチェックをリセット
            </button>
          </div>

          {/* セッション別アコーディオン */}
          <div className="mx-4 space-y-3">
            {SESSIONS.map(session => {
              const isOpen = openSessions.has(session.id);
              const testable = session.items.filter(i => i.test);
              const doneCount = testable.filter(i => checked[i.text]).length;
              return (
                <div key={session.id} className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
                  <button onClick={() => toggleSession(session.id)}
                    className="w-full flex items-center justify-between px-4 py-3 text-left">
                    <div>
                      <p className="text-sm font-bold text-gray-800">{session.title}</p>
                      <p className="text-xs text-gray-400">{session.versionRange}{testable.length > 0 ? ` ・ ${doneCount}/${testable.length}件確認済み` : ""}</p>
                    </div>
                    <span className="text-gray-400 text-xs">{isOpen ? "▲" : "▼"}</span>
                  </button>
                  {isOpen && (
                    <div className="border-t border-gray-50">
                      {session.items.map((item, i) => (
                        <CheckRow
                          key={i}
                          id={item.text}
                          text={item.text}
                          test={item.test}
                          checked={!!checked[item.text]}
                          onToggle={toggle}
                        />
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}

      {view === "log" && (
        <div className="mx-4 space-y-3">
          {SESSIONS.map(session => (
            <div key={session.id} className="bg-white rounded-2xl p-4 border border-gray-100">
              <p className="text-sm font-bold text-gray-800 mb-1">{session.title}</p>
              <p className="text-xs text-gray-400 mb-3">{session.versionRange}</p>
              <ul className="space-y-1.5">
                {session.items.map((item, i) => (
                  <li key={i} className="text-xs text-gray-600 flex gap-1.5">
                    <span className="text-gray-300">・</span>
                    <span>{item.text}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
