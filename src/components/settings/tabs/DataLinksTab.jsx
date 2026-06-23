import { useState } from "react";

const DATA_LINKS = [
  {
    name: "エポスカード",
    icon: "💳",
    desc: "利用明細PDF（月次）",
    color: "bg-red-50 border-red-200 text-red-700",
    url: "https://www.eposcard.co.jp/memberservice/pc/paymentamountreference/disp_use_detail_preload.do",
  },
  {
    name: "三井住友カード",
    icon: "💳",
    desc: "印刷用ページ → PDF保存",
    color: "bg-green-50 border-green-200 text-green-700",
    url: "https://www.smbc-card.com/memx/web_meisai/top/index.html",
    browserRequired: true,
    howto: [
      "明細ページで「印刷用ページを表示」をタップ",
      "共有ボタン →「PDFを作成」→「ファイルに保存」",
      "追加 → CSVインポートで読み込む",
    ],
  },
  {
    name: "住信SBIネット銀行",
    icon: "🏦",
    desc: "入出金明細CSV",
    color: "bg-blue-50 border-blue-200 text-blue-700",
    url: "https://www.netbk.co.jp/contents/pages/wpl020201C/i020201CT/DI02020150",
  },
  {
    name: "SBI証券",
    icon: "📈",
    desc: "保有証券一覧CSV（SaveFile.csv）",
    color: "bg-emerald-50 border-emerald-200 text-emerald-700",
    url: "https://site3.sbisec.co.jp/ETGate/?_ControlID=WPLETacR002Control&_PageID=DefaultPID&getFlg=on",
  },
  {
    name: "JCBカード",
    icon: "💳",
    desc: "利用明細CSV",
    color: "bg-orange-50 border-orange-200 text-orange-700",
    url: "https://my.jcb.co.jp/iss-pc/member/details_inquiry/detail.html",
  },
  {
    name: "Amazon注文履歴",
    icon: "📦",
    desc: "注文履歴レポート（数日かかる場合あり）",
    color: "bg-yellow-50 border-yellow-200 text-yellow-700",
    url: "https://www.amazon.co.jp/hz/privacy-central/data-requests/preview.html",
  },
  {
    name: "PayPay",
    icon: "📱",
    desc: "アプリからのみ申請可能",
    color: "bg-gray-50 border-gray-200 text-gray-500",
    url: null,
  },
];

const openInBrowser = (browser, url) => {
  const encoded = encodeURIComponent(url);
  const schemes = {
    chrome: `googlechromes://${url.replace(/^https?:\/\//, "")}`,
    brave:  `brave://${url.replace(/^https?:\/\//, "")}`,
    safari: url,
  };
  const scheme = schemes[browser];
  const a = document.createElement("a");
  a.href = scheme;
  a.target = "_blank";
  a.rel = "noopener noreferrer";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
};

export function DataLinksTab() {
  const [expanded, setExpanded] = useState({});

  return (
    <div className="px-4 py-4 space-y-3">
      <p className="text-xs text-gray-500 leading-relaxed">
        各サービスのダウンロードページへ直接移動できます。ファイルをダウンロード後、追加 → CSVインポートで取り込んでください。
      </p>
      {DATA_LINKS.map(item => (
        <div key={item.name} className={`rounded-xl border overflow-hidden ${item.color}`}>
          {/* メイン行 */}
          <div className="flex items-center justify-between px-3.5 py-3">
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <span className="text-2xl flex-shrink-0">{item.icon}</span>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <p className="text-sm font-bold">{item.name}</p>
                  {item.browserRequired && (
                    <span className="text-xs bg-white px-1.5 py-0.5 rounded-full border border-current opacity-80 font-semibold flex-shrink-0">
                      Chrome推奨
                    </span>
                  )}
                </div>
                <p className="text-xs opacity-70 mt-0.5">{item.desc}</p>
              </div>
            </div>

            {/* ボタン */}
            {item.url && !item.browserRequired && (
              <a href={item.url} target="_blank" rel="noopener noreferrer"
                className="px-3 py-2 bg-white rounded-lg text-xs font-semibold border border-current opacity-80 whitespace-nowrap flex-shrink-0 ml-2">
                開く →
              </a>
            )}
            {item.url && item.browserRequired && (
              <button
                onClick={() => setExpanded(p => ({ ...p, [item.name]: !p[item.name] }))}
                className="px-3 py-2 bg-white rounded-lg text-xs font-semibold border border-current opacity-80 whitespace-nowrap flex-shrink-0 ml-2">
                {expanded[item.name] ? "閉じる ▲" : "開く ▼"}
              </button>
            )}
            {!item.url && (
              <span className="px-3 py-2 text-xs opacity-50 flex-shrink-0">アプリのみ</span>
            )}
          </div>

          {/* 三井住友カードの展開パネル */}
          {item.browserRequired && expanded[item.name] && (
            <div className="border-t border-green-200 bg-white px-4 py-3 space-y-3">
              {/* ブラウザ選択ボタン */}
              <div>
                <p className="text-xs font-semibold text-gray-600 mb-2">ブラウザを選択して開く：</p>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => openInBrowser("chrome", item.url)}
                    className="flex items-center justify-center gap-1.5 px-3 py-2.5 bg-blue-500 text-white rounded-xl text-xs font-semibold">
                    <span>🔵</span> Chromeで開く
                  </button>
                  <button
                    onClick={() => openInBrowser("brave", item.url)}
                    className="flex items-center justify-center gap-1.5 px-3 py-2.5 bg-orange-500 text-white rounded-xl text-xs font-semibold">
                    <span>🦁</span> Braveで開く
                  </button>
                </div>
                <button
                  onClick={() => openInBrowser("safari", item.url)}
                  className="w-full mt-2 px-3 py-2 bg-gray-100 text-gray-500 rounded-xl text-xs font-semibold">
                  Safariで開く（PDFが読み込めない場合あり）
                </button>
              </div>

              {/* 手順 */}
              <div className="bg-amber-50 rounded-xl p-3 border border-amber-100">
                <p className="text-xs font-semibold text-amber-700 mb-1.5">📋 PDF取得手順</p>
                <ol className="space-y-1">
                  {item.howto.map((step, i) => (
                    <li key={i} className="text-xs text-gray-600 flex gap-2">
                      <span className="text-green-600 font-bold flex-shrink-0">{i + 1}.</span>
                      <span>{step}</span>
                    </li>
                  ))}
                </ol>
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
