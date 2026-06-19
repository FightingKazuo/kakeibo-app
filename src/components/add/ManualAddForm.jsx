import { useState } from "react";
import { todayStr } from "../../utils/format";
import { createTransaction, findDuplicateCandidates } from "../../services/transaction";
import { DEFAULT_CATEGORY_RULES } from "../../constants";
import { TransactionFormFields } from "../../common/TransactionFormFields";
import { DuplicateCheckModal } from "../../common/DuplicateCheckModal";
import { PrimaryButton } from "../../ui/PrimaryButton";

export function ManualAddForm({ categories, allRules, learnedRules, members, pointAccounts, existingTransactions, onAdd, onLearnRule, onBack }) {
  const [type,           setType]          = useState("expense");
  const [amount,         setAmount]        = useState("");
  const [label,          setLabel]         = useState("");
  const [date,           setDate]          = useState(todayStr());
  const [category,       setCategory]      = useState("");
  const [paidBy,         setPaidBy]        = useState("");
  const [payMethod,      setPayMethod]     = useState("cash");
  const [pendingTx,      setPendingTx]     = useState(null);
  const [dupCandidates,  setDupCandidates] = useState([]);
  const [done,           setDone]          = useState(false);

  const finalAdd = (tx) => {
    onAdd(tx);
    if (tx.label && tx.category) onLearnRule?.(tx.label, tx.category, tx.type || "expense");
    setDone(true);
    setTimeout(() => { setDone(false); setLabel(""); setAmount(""); setCategory(""); onBack(); }, 1500);
  };

  const checkAndAdd = (tx) => {
    const cands = findDuplicateCandidates(tx, existingTransactions);
    if (cands.length > 0) { setPendingTx(tx); setDupCandidates(cands); }
    else finalAdd(tx);
  };

  const handleSubmit = () => {
    if (!amount || !category || !label) { alert("すべて入力してください"); return; }
    const tx = createTransaction({
      date, label, category,
      amount:        type === "expense" ? -Number(amount) : Number(amount),
      type,          source: "manual",
      paidBy:        paidBy || null,
      paymentMethod: payMethod,
      pointAccountId: payMethod !== "cash" ? payMethod : null,
    });
    checkAndAdd(tx);
  };

  return (
    <div className="pb-20">
      {dupCandidates.length > 0 && pendingTx && (
        <DuplicateCheckModal newTx={pendingTx} candidates={dupCandidates} categories={categories}
          onDecide={d => {
            if (d !== "skip" && pendingTx) finalAdd(pendingTx);
            else onBack();
            setDupCandidates([]); setPendingTx(null);
          }} />
      )}
      <div className="bg-white px-4 pt-12 pb-4 border-b border-gray-100 flex items-center gap-3">
        <button onClick={onBack} className="text-gray-400 text-lg">←</button>
        <h1 className="text-xl font-bold text-gray-900">手動入力</h1>
      </div>
      <div className="px-4 py-5">
        <TransactionFormFields
          type={type} setType={setType} amount={amount} setAmount={setAmount}
          label={label} setLabel={setLabel} date={date} setDate={setDate}
          category={category} setCategory={setCategory}
          categories={categories}
          allRules={allRules || DEFAULT_CATEGORY_RULES} learnedRules={learnedRules || []}
        />
        {members && members.length > 0 && (
          <div className="mt-4">
            <label className="block text-xs font-semibold text-gray-500 mb-2">支払者</label>
            <div className="flex gap-2">
              {members.map(m => (
                <button key={m.id} onClick={() => setPaidBy(paidBy === m.id ? "" : m.id)}
                  className={`flex-1 py-2.5 rounded-xl text-sm font-medium border transition-all ${paidBy === m.id ? "bg-indigo-500 text-white border-indigo-500" : "bg-white text-gray-600 border-gray-200"}`}>
                  👤 {m.name}
                </button>
              ))}
            </div>
          </div>
        )}
        <div className="mt-4">
          <label className="block text-xs font-semibold text-gray-500 mb-2">支払方法</label>
          <div className="flex flex-wrap gap-2">
            <button onClick={() => setPayMethod("cash")}
              className={`px-3 py-2 rounded-xl text-xs font-medium border transition-all ${payMethod === "cash" ? "bg-indigo-500 text-white border-indigo-500" : "bg-white text-gray-600 border-gray-200"}`}>
              💳 現金/カード
            </button>
            {(pointAccounts || []).map(a => (
              <button key={a.id} onClick={() => setPayMethod(a.id)}
                className={`px-3 py-2 rounded-xl text-xs font-medium border transition-all ${payMethod === a.id ? "bg-amber-500 text-white border-amber-500" : "bg-white text-gray-600 border-gray-200"}`}>
                {a.icon} {a.name}
                <span className="ml-1 opacity-70">({a.balance.toLocaleString()}{a.unit})</span>
              </button>
            ))}
          </div>
        </div>
        <div className="mt-5">
          <PrimaryButton onClick={handleSubmit} variant={done ? "success" : "primary"}>
            {done ? "✅ 保存しました！" : "追加して保存"}
          </PrimaryButton>
        </div>
      </div>
    </div>
  );
}
