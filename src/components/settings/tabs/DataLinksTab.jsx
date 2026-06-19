const DATA_LINKS = [
  { name: "エポスカード",      icon: "💳", desc: "利用明細PDF（月次）",              color: "bg-red-50 border-red-200 text-red-700",       url: "https://www.eposcard.co.jp/memberservice/pc/paymentamountreference/disp_use_detail_preload.do" },
  { name: "三井住友カード",    icon: "💳", desc: "Web明細CSV",                       color: "bg-green-50 border-green-200 text-green-700",  url: "https://www.smbc-card.com/memx/web_meisai/top/index.html" },
  { name: "住信SBIネット銀行", icon: "🏦", desc: "入出金明細CSV",                    color: "bg-blue-50 border-blue-200 text-blue-700",    url: "https://www.netbk.co.jp/contents/pages/wpl020201C/i020201CT/DI02020150" },
  { name: "SBI証券",           icon: "📈", desc: "保有証券一覧CSV（SaveFile.csv）",  color: "bg-emerald-50 border-emerald-200 text-emerald-700", url: "https://site3.sbisec.co.jp/ETGate/?_ControlID=WPLETacR002Control&_PageID=DefaultPID&getFlg=on" },
  { name: "JCBカード",         icon: "💳", desc: "利用明細CSV",                      color: "bg-orange-50 border-orange-200 text-orange-700", url: "https://my.jcb.co.jp/iss-pc/member/details_inquiry/detail.html" },
  { name: "Amazon注文履歴",    icon: "📦", desc: "注文履歴レポート（数日かかる場合あり）", color: "bg-yellow-50 border-yellow-200 text-yellow-700", url: "https://www.amazon.co.jp/hz/privacy-central/data-requests/preview.html" },
  { name: "PayPay",            icon: "📱", desc: "アプリからのみ申請可能",           color: "bg-gray-50 border-gray-200 text-gray-500",    url: null },
];

export function DataLinksTab() {
  return (
    <div className="px-4 py-4 space-y-3">
      <p className="text-xs text-gray-500 leading-relaxed">
        各サービスのダウンロードページへ直接移動できます。ファイルをダウンロード後、追加 → CSVインポートで取り込んでください。
      </p>
      {DATA_LINKS.map(item => (
        <div key={item.name} className={`rounded-xl p-3.5 border ${item.color}`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-2xl">{item.icon}</span>
              <div>
                <p className="text-sm font-bold">{item.name}</p>
                <p className="text-xs opacity-70 mt-0.5">{item.desc}</p>
              </div>
            </div>
            {item.url ? (
              <a href={item.url} target="_blank" rel="noopener noreferrer"
                className="px-3 py-2 bg-white rounded-lg text-xs font-semibold border border-current opacity-80 hover:opacity-100 whitespace-nowrap">
                開く →
              </a>
            ) : (
              <span className="px-3 py-2 text-xs opacity-50">アプリのみ</span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
