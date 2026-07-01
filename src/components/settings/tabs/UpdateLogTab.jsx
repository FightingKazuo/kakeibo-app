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
      "React + Vite + Tailwind + Vercel構成を確立",
      "OCR.space + Gemini のハイブリッドOCR方式を採用",
      "店舗名の修正学習システム（saveCorrection/lookupCorrection）",
      "三井住友カードCSVのShift-JIS検出バグ修正",
      "detectCSVFormat関数追加（フォーマット自動判定）",
      "複数ファイル同時アップロード対応",
    ],
  },
  {
    id: "s2",
    title: "セッション2：CSV消し込み・精算計算修正",
    versionRange: "v2.x 〜 v2.7.6",
    items: [
      "CSV「消し込み」方式（分類後に自動チェックOFF）",
      "取引リストに長押し選択モード・一括操作機能",
      "精算計算バグ修正（paidBy未設定取引の集計）",
      "PayPay対応（チャージ→収入、送金→個人支出）",
    ],
  },
  {
    id: "s3",
    title: "セッション3：OCR精度向上・CSV管理画面",
    versionRange: "v2.7.7 〜 v3.0.8",
    items: [
      "Gemini OCR v8（JSON強制・画像圧縮・トークン数増加）",
      "ウエルシア20日WAON特別対応（1.5倍ポイント）",
      "カテゴリ変更モードUI（チェック→カテゴリボタンで一括変更）",
      "CSV管理画面（activeCsvSourcesでON/OFF管理）",
      "RulesTab 4サブタブ化（学習/分類/カード対応/振替キーワード）",
    ],
  },
  {
    id: "s4",
    title: "セッション4：精算タブ改善・SMBC PDFパーサー",
    versionRange: "v3.0.0 〜 v3.1.2",
    items: [
      "精算タブにチェックボックス選択UI・一括shareType変更",
      "カード口座振替の自動スキップ分類",
      "BANK_CARD_MAPPING確立（エポス/三井住友/JCB）",
      "三井住友カードPDF対応（3パターンパーサー）",
      "Amazon注文履歴CSV対応（Cancelled除外・重複排除）",
      "ルール管理のMarkdown化（kakeibo-rules.md）",
    ],
  },
  {
    id: "s5",
    title: "セッション5：SMBC PDFパーサー完成・予算機能",
    versionRange: "v3.1.x 〜 v3.5.x",
    items: [
      "SMBC PDFパーサー完全書き直し（実データ4ヶ月分で精度100%確認）",
      "OCR重複検出UI（スキップ/両方残す/置き換えの3択）",
      "カテゴリ自動学習システム",
      "予算タブ追加（カテゴリ別進捗バー・80%/100%アラート）",
      "csvSourceLabels / budgets のSupabase移行",
      "CSVソース別デフォルトshareType設定",
      "投資信託積立タブ追加（概算評価額表示）",
    ],
  },
  {
    id: "s6",
    title: "セッション6：パーサー総点検・重複検出強化",
    versionRange: "v3.6.0 〜 v3.6.x",
    items: [
      "三井住友カードCSV新フォーマット対応（2026年6月以降の列構成変更）",
      "楽天カードPDF対応",
      "三井住友カードPDFの店名折り返しバグ修正",
      "PDFインポート時の取込履歴マーク漏れ修正",
      "複数カード同時インポート時のcsvFormatId取り違え修正",
      "CSVインポート時のカテゴリ自動分類",
      "「（カ）ジエーシービー」のカード振替認識",
      "「振込＊コバヤシ」入金の収入計上修正",
      "OCR/CSV表記ゆれによる重複検出漏れ修正（同日+金額一致条件追加）",
      "OCR重複時のデフォルトアクションを「スキップ」に変更",
      "取引一覧でのCSVカード別フィルター追加",
      "CSVバッジ表示をカード名に変更（📊CSV SBI→📊SBI）",
    ],
  },
  {
    id: "s7",
    title: "セッション7：自動回帰テスト導入",
    versionRange: "v3.7.0",
    items: [
      "アップデート履歴タブを追加（このページ）",
      "全パーサーの自動回帰テストスクリプトを整備し実行",
      "カテゴリ分類で「セブン－イレブン」等、全角ハイフン・長音記号を含む店名が「その他」になるバグを修正",
    ],
  },
];

export function UpdateLogTab() {
  return (
    <div className="pb-6 px-4 space-y-3">
      <p className="text-xs text-gray-400 px-1">
        これまでの開発セッションごとのアップデート内容です。
      </p>
      {SESSIONS.map(session => (
        <div key={session.id} className="bg-white rounded-2xl p-4 border border-gray-100">
          <p className="text-sm font-bold text-gray-800 mb-1">{session.title}</p>
          <p className="text-xs text-gray-400 mb-3">{session.versionRange}</p>
          <ul className="space-y-1.5">
            {session.items.map((item, i) => (
              <li key={i} className="text-xs text-gray-600 flex gap-1.5">
                <span className="text-gray-300">・</span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
