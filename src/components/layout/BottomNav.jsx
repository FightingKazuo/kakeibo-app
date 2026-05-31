const NAV_ITEMS = [
  { id:"home",     icon:"🏠", label:"ホーム"   },
  { id:"list",     icon:"📋", label:"一覧"     },
  { id:"add",      icon:"➕", label:"追加"     },
  { id:"analysis", icon:"📊", label:"分析"     },
  { id:"settings", icon:"⚙️", label:"設定"     },
];

export function BottomNav({ currentPage, onNavigate }) {
  return (
    <nav className="nav-safe fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 z-50">
      <div className="flex justify-around items-center h-14 max-w-md mx-auto">
        {NAV_ITEMS.map(item => (
          <button key={item.id} onClick={() => onNavigate(item.id)}
            className={`flex flex-col items-center gap-0.5 flex-1 py-1.5 transition-all duration-200 ${currentPage===item.id?"text-indigo-600 font-semibold":"text-gray-400"}`}>
            <span className={`text-xl transition-transform duration-200 ${currentPage===item.id?"scale-110":""}`}>{item.icon}</span>
            <span className="text-xs">{item.label}</span>
          </button>
        ))}
      </div>
    </nav>
  );
}
