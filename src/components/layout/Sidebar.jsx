const NAV_ITEMS = [
  { id:"home",     icon:"🏠", label:"ホーム"   },
  { id:"list",     icon:"📋", label:"一覧"     },
  { id:"add",      icon:"➕", label:"追加"     },
  { id:"analysis", icon:"📊", label:"分析"     },
  { id:"settings", icon:"⚙️", label:"設定"     },
];

export function Sidebar({ currentPage, onNavigate }) {
  return (
    <div className="flex flex-col h-full bg-white border-r border-gray-200">
      {/* ロゴ */}
      <div className="px-6 py-6 border-b border-gray-100">
        <div className="flex items-center gap-3">
          <span className="text-3xl">💴</span>
          <div>
            <p className="text-base font-bold text-gray-900">家計簿アプリ</p>
            <p className="text-xs text-gray-400">Smart Kakeibo</p>
          </div>
        </div>
      </div>

      {/* ナビゲーション */}
      <nav className="flex-1 px-3 py-4 space-y-1">
        {NAV_ITEMS.map(item => (
          <button
            key={item.id}
            onClick={() => onNavigate(item.id)}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all duration-200
              ${currentPage === item.id
                ? "bg-indigo-50 text-indigo-600 font-semibold"
                : "text-gray-500 hover:bg-gray-50 hover:text-gray-700"
              }`}
          >
            <span className="text-xl">{item.icon}</span>
            <span>{item.label}</span>
          </button>
        ))}
      </nav>

      {/* フッター */}
      <div className="px-6 py-4 border-t border-gray-100">
        <p className="text-xs text-gray-400">v2.0.0</p>
      </div>
    </div>
  );
}
