import { useState } from "react";
import { todayStr, fmtCurrency } from "../../utils/format";
import { PrimaryButton } from "../ui/PrimaryButton";
import { DEFAULT_CATEGORY_RULES } from "../../constants";

// ─── 品目タイプトグル（共有/個人/相手）──────────────────────
function ItemTypeToggle({ type, onChange }) {
  return (
    <div className="flex rounded-lg overflow-hidden border border-gray-200 flex-shrink-0">
      {[
        { value: "shared",   label: "共有", activeClass: "bg-indigo-500 text-white" },
        { value: "personal", label: "個人", activeClass: "bg-rose-400 text-white"   },
        { value: "partner",  label: "相手", activeClass: "bg-purple-400 text-white" },
      ].map(opt => (
        <button key={opt.value} onClick={() => onChange(opt.value)}
          className={`px-2 py-1 text-xs font-medium transition-all ${
            type === opt.value ? opt.activeClass : "bg-white text-gray-400"
          }`}>
          {opt.label}
        </button>
      ))}
    </div>
  );
}

export function EditPage({ transaction, categories, allRules, learnedRules, members, pointAccounts, onSave, onCancel }) {
  const [type,      setType]      = useState(transaction.type);
  const [amount,    setAmount]    = useState(String(Math.abs(transaction.amount)));
  const [label,     setLabel]     = useState(transaction.label);
  const [date,      setDate]      = useState(transaction.date || todayStr());
  const [category,  setCategory]  = useState(transaction.category);
  const [paidBy,    setPaidBy]    = useState(transaction.paidBy || "");
  const [payMethod, setPayMethod] = useState(transaction.paymentMethod || "cash");
  const [shareType, setShareType] = useState(transaction.shareType || "shared");
  const [memo,      setMemo]      = useState(transaction.memo || "");

  const [items, setItems] = useState(
    Array.isArray(transaction.items) ? transaction.items.map(i => ({ ...i })) : []
  );
  const isTaxExclusive = items.some(i => i.amountExclTax != null);
  const taxLabel = isTaxExclusive ? "税抜き" : "税込み";

  const handleSave = () => {
    if (!amount || !category || !label) { alert("すべて入力してください"); return; }

    // 税抜きの場合、保存時に税込みに変換
    const savedItems = isTaxExclusive
      ? items.map(i => ({
          ...i,
          amountExclTax: i.amountExclTax ?? i.amount,
          amount:        Math.round((i.amountExclTax ?? i.amount) * 1.08),
          taxRate:       8,
        }))
      : items;

    onSave({
      ...transaction,
      type,
      amount:        type === "expense" ? -Number(amount) : Number(amount),
      label, date, category,
      paidBy:        paidBy || null,
      paymentMethod: payMethod,
      pointAccountId: payMethod !== "cash" ? payMethod : null,
      shareType,
      memo:          memo || "",
      items:         savedItems,
      updatedAt:     new Date().toISOString(),
    });
  };

  const displayCats = categories.filter(c => c.type === type);

  const [editCatMode,  setEditCatMode]  = useState(false);
  const [selectedItems, setSelectedItems] = useState(new Set());

  const toggleItemSelect = (idx) => setSelectedItems(prev => {
    const next = new Set(prev); next.has(idx) ? next.delete(idx) : next.add(idx); return next;
  });

  const applyItemCategory = (catName) => {
    if (selectedItems.size === 0) return;
    setItems(p => p.map((item, i) => selectedItems.has(i) ? { ...item, category: catName } : item));
    const count = selectedItems.size;
    setSelectedItems(new Set());
    // モードは維持して変更を確認できるようにする
    alert(`✅ ${count}件のカテゴリーを「${catName}」に変更しました`);
  };

  // 品目編集
  const updateItemAmount = (idx, unitPrice) => {
    setItems(p => p.map((item, i) => {
      if (i !== idx) return item;
      const qty    = item.quantity || 1;
      const amount = unitPrice * qty;
      return { ...item, unitPrice, amount };
    }));
  };
  const updateItemQuantity = (idx, qty) => {
    setItems(p => p.map((item, i) => {
      if (i !== idx) return item;
      const up     = item.unitPrice || item.amount;
      const amount = up * qty;
      return { ...item, quantity: qty, amount };
    }));
  };
  const updateItemType = (idx, type) =>
    setItems(p => p.map((item, i) => i === idx ? { ...item, type } : item));

  const itemsTotal = items.reduce((s, i) => s + (i.amount || 0), 0);
  const totalAmt   = Number(amount);
  const taxDiff    = totalAmt - itemsTotal;

  return (
    <div className="pb-20">
      <div className="bg-white px-4 pt-12 pb-4 border-b border-gray-100 flex items-center gap-3">
        <button onClick={onCancel} className="text-gray-400 text-lg">←</button>
        <h1 className="text-xl font-bold text-gray-900">取引を編集</h1>
      </div>
      <div className="px-4 py-5 space-y-5">
        <div className="bg-amber-50 rounded-xl p-3 border border-amber-100">
          <p className="text-xs text-amber-700 font-semibold">✏️ 編集中：「{transaction.label}」</p>
        </div>

        {/* 種類 */}
        <div>
          <label className="block text-xs font-semibold text-gray-500 mb-2">種類</label>
          <div className="grid grid-cols-2 gap-2">
            {["expense","income"].map(t => (
              <button key={t} onClick={() => setType(t)}
                className={`py-3 rounded-xl text-sm font-semibold border transition-all ${
                  type === t
                    ? t === "expense" ? "bg-rose-500 text-white border-rose-500" : "bg-emerald-500 text-white border-emerald-500"
                    : "bg-white text-gray-500 border-gray-200"
                }`}>
                {t === "expense" ? "支出" : "収入"}
              </button>
            ))}
          </div>
        </div>

        {/* 店舗名 */}
        <div>
          <label className="block text-xs font-semibold text-gray-500 mb-2">店舗名・内容</label>
          <input type="text" value={label} onChange={e => setLabel(e.target.value)}
            className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-indigo-300" />
        </div>

        {/* 金額 */}
        <div>
          <label className="block text-xs font-semibold text-gray-500 mb-2">金額</label>
          <div className="relative">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 font-bold">¥</span>
            <input type="number" value={amount} onChange={e => setAmount(e.target.value)}
              className="w-full pl-8 pr-4 py-3.5 bg-gray-50 border border-gray-200 rounded-xl text-2xl font-bold outline-none focus:ring-2 focus:ring-indigo-300" />
          </div>
        </div>

        {/* カテゴリ（4列） */}
        <div>
          <label className="block text-xs font-semibold text-gray-500 mb-2">カテゴリ</label>
          <div className="grid grid-cols-4 gap-1.5">
            {displayCats.map(cat => (
              <button key={cat.id} onClick={() => setCategory(cat.name)}
                className={`py-2 px-1 rounded-xl text-xs border transition-all flex flex-col items-center gap-0.5 ${
                  category === cat.name ? "bg-indigo-500 text-white border-indigo-500 font-semibold" : "bg-white text-gray-600 border-gray-200"
                }`}>
                <span className="text-base">{cat.emoji}</span>
                <span className="leading-tight text-center">{cat.name}</span>
              </button>
            ))}
          </div>
        </div>

        {/* 日付 */}
        <div>
          <label className="block text-xs font-semibold text-gray-500 mb-2">日付</label>
          <input type="date" value={date} onChange={e => setDate(e.target.value)}
            className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-indigo-300" />
        </div>

        {/* 支払者 */}
        {members && members.length > 0 && (
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-2">支払者</label>
            <div className="flex gap-2">
              {members.map(m => (
                <button key={m.id} onClick={() => setPaidBy(paidBy === m.id ? "" : m.id)}
                  className={`flex-1 py-2.5 rounded-xl text-sm font-medium border transition-all ${
                    paidBy === m.id ? "bg-indigo-500 text-white border-indigo-500" : "bg-white text-gray-600 border-gray-200"
                  }`}>
                  👤 {m.name}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* 支払方法 */}
        <div>
          <label className="block text-xs font-semibold text-gray-500 mb-2">費用の種別</label>
          <div className="grid grid-cols-3 gap-2">
            {[
              { value: "shared",   label: "🤝 共有",   activeClass: "bg-indigo-500 text-white border-indigo-500" },
              { value: "personal", label: "👤 個人",   activeClass: "bg-rose-400 text-white border-rose-400"     },
              { value: "partner",  label: "👥 相手",   activeClass: "bg-purple-400 text-white border-purple-400" },
            ].map(opt => (
              <button key={opt.value} onClick={() => setShareType(opt.value)}
                className={`py-2.5 rounded-xl text-sm font-medium border transition-all ${
                  shareType === opt.value ? opt.activeClass : "bg-white text-gray-500 border-gray-200"
                }`}>
                {opt.label}
              </button>
            ))}
          </div>
          {items.length > 0 && (
            <p className="text-xs text-gray-400 mt-1.5">※ 品目がある場合は品目ごとに設定した種別が優先されます</p>
          )}
        </div>

        {/* 支払方法 */}
        <div>
          <label className="block text-xs font-semibold text-gray-500 mb-2">支払方法</label>
          <div className="flex flex-wrap gap-2">
            <button onClick={() => setPayMethod("cash")}
              className={`px-3 py-2 rounded-xl text-xs font-medium border transition-all ${
                payMethod === "cash" ? "bg-indigo-500 text-white border-indigo-500" : "bg-white text-gray-600 border-gray-200"
              }`}>
              💳 現金/カード
            </button>
            {(pointAccounts || []).map(a => (
              <button key={a.id} onClick={() => setPayMethod(a.id)}
                className={`px-3 py-2 rounded-xl text-xs font-medium border transition-all ${
                  payMethod === a.id ? "bg-amber-500 text-white border-amber-500" : "bg-white text-gray-600 border-gray-200"
                }`}>
                {a.icon} {a.name}
              </button>
            ))}
          </div>
        </div>

        {/* 品目編集 */}
        {items.length > 0 && (
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-semibold text-gray-500">
                品目（共有/個人/相手・金額変更）
                <span className={`ml-2 px-1.5 py-0.5 rounded text-xs ${isTaxExclusive ? "bg-amber-100 text-amber-600" : "bg-gray-100 text-gray-500"}`}>
                  {taxLabel}
                </span>
              </label>
              <button onClick={() => { setEditCatMode(p => !p); setSelectedItems(new Set()); }}
                className={`text-xs px-2.5 py-1 rounded-full border transition-all ${editCatMode ? "bg-indigo-500 text-white border-indigo-500" : "bg-indigo-50 text-indigo-500 border-indigo-200"}`}>
                🏷️ カテゴリー変更
              </button>
            </div>

            {/* カテゴリー一括変更UI */}
            {editCatMode && (
              <div className="mb-3 bg-indigo-50 rounded-xl p-3 border border-indigo-100 space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold text-indigo-600">
                    {selectedItems.size === 0 ? "変更する品目を選択してください" : `${selectedItems.size}件を選択中`}
                  </p>
                  <button onClick={() => setSelectedItems(new Set(items.map((_, i) => i)))}
                    className="text-xs text-indigo-400 border border-indigo-200 px-2 py-0.5 rounded-lg bg-white">全選択</button>
                </div>
                {selectedItems.size > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {displayCats.map(cat => (
                      <button key={cat.id} onClick={() => applyItemCategory(cat.name)}
                        className="px-2.5 py-1 rounded-full text-xs border bg-white text-gray-600 border-gray-200 hover:bg-indigo-500 hover:text-white hover:border-indigo-500 transition-all">
                        {cat.emoji} {cat.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div className="border border-gray-100 rounded-xl overflow-hidden">
              {items.map((item, i) => {
                // 税抜きの場合はamountExclTaxを表示、なければamountをそのまま
                const displayPrice = isTaxExclusive
                  ? (item.amountExclTax || Math.round(item.amount / 1.08))
                  : (item.unitPrice || item.amount);
                const displayTotal = isTaxExclusive
                  ? displayPrice * (item.quantity || 1)
                  : item.amount;

                return (
                  <div key={i} className={`px-4 py-3 border-b border-gray-50 last:border-b-0 ${
                    item.type === "personal" ? "bg-rose-50" :
                    item.type === "partner"  ? "bg-purple-50" : "bg-white"
                  }`}>
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        {editCatMode && (
                          <input type="checkbox" checked={selectedItems.has(i)} onChange={() => toggleItemSelect(i)}
                            className="accent-indigo-500 w-4 h-4 flex-shrink-0" />
                        )}
                        <p className="text-xs font-medium text-gray-800 flex-1 truncate mr-2">{item.name}</p>
                        {item.category && item.category !== "その他" && (
                          <span className={`text-xs px-1.5 py-0.5 rounded-full border flex-shrink-0 ${
                            item.category !== category
                              ? "bg-indigo-50 text-indigo-600 border-indigo-200 font-medium"
                              : "bg-gray-50 text-gray-400 border-gray-200"
                          }`}>
                            {displayCats.find(c => c.name === item.category)?.emoji} {item.category}
                          </span>
                        )}
                      </div>
                      {!editCatMode && <ItemTypeToggle type={item.type || "shared"} onChange={t => updateItemType(i, t)} />}
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs text-gray-400">単価</span>
                      <input type="number"
                        value={displayPrice}
                        onChange={e => {
                          const newPrice = Number(e.target.value);
                          const qty      = item.quantity || 1;
                          setItems(p => p.map((it, j) => j !== i ? it : {
                            ...it,
                            amountExclTax: isTaxExclusive ? newPrice : undefined,
                            unitPrice:     newPrice,
                            amount:        isTaxExclusive ? Math.round(newPrice * qty * 1.08) : newPrice * qty,
                          }));
                        }}
                        className="w-20 text-xs font-bold text-right bg-white border border-gray-200 rounded-lg px-1.5 py-1 outline-none focus:ring-1 focus:ring-indigo-300" />
                      <span className="text-xs text-gray-400">×</span>
                      <input type="number"
                        value={item.quantity || 1} min={1}
                        onChange={e => {
                          const qty      = Math.max(1, Number(e.target.value));
                          const price    = displayPrice;
                          setItems(p => p.map((it, j) => j !== i ? it : {
                            ...it,
                            quantity: qty,
                            amount:   isTaxExclusive ? Math.round(price * qty * 1.08) : price * qty,
                          }));
                        }}
                        className="w-12 text-xs font-bold text-center bg-white border border-gray-200 rounded-lg px-1.5 py-1 outline-none focus:ring-1 focus:ring-indigo-300" />
                      <span className="text-xs text-gray-400">=</span>
                      <div className="text-right">
                        {isTaxExclusive && (
                          <p className="text-xs text-gray-400">税抜 ¥{displayTotal.toLocaleString()}</p>
                        )}
                        <p className="text-xs font-bold text-gray-700">
                          税込 ¥{item.amount.toLocaleString()}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })}

              {/* 消費税等の差額表示 */}
              {Math.abs(taxDiff) >= 2 && (
                <div className={`flex items-center justify-between px-4 py-2.5 ${taxDiff > 0 ? "bg-amber-50" : "bg-emerald-50"}`}>
                  <p className="text-xs font-medium text-gray-600">
                    {taxDiff > 0 ? "🧾 消費税等" : "💰 値引き等"}
                  </p>
                  <p className={`text-xs font-bold ${taxDiff > 0 ? "text-amber-600" : "text-emerald-600"}`}>
                    {taxDiff > 0 ? `+¥${taxDiff.toLocaleString()}` : `-¥${Math.abs(taxDiff).toLocaleString()}`}
                  </p>
                </div>
              )}

              <div className="flex justify-between px-4 py-2.5 bg-gray-50 border-t border-gray-100">
                <p className="text-xs text-gray-500">品目合計</p>
                <p className="text-xs font-bold text-gray-700">¥{itemsTotal.toLocaleString()}</p>
              </div>
            </div>
          </div>
        )}

        {/* 備考 */}
        <div>
          <label className="block text-xs font-semibold text-gray-500 mb-2">📝 備考（任意）</label>
          <textarea
            value={memo}
            onChange={e => setMemo(e.target.value)}
            placeholder="例: ガソリン代（車通勤用）、家族旅行のホテル代 など"
            rows={2}
            className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-indigo-300 resize-none"
          />
        </div>

        <PrimaryButton onClick={handleSave} variant="warning">✅ 更新して保存</PrimaryButton>
      </div>
    </div>
  );
}

