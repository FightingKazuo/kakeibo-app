import { useState } from "react";
import { todayStr } from "../../utils/format";
import { TransactionFormFields } from "../common/TransactionFormFields";
import { PrimaryButton } from "../ui/PrimaryButton";
import { DEFAULT_CATEGORY_RULES } from "../../constants";

export function EditPage({ transaction, categories, allRules, learnedRules, onSave, onCancel }) {
  const [type,     setType]     = useState(transaction.type);
  const [amount,   setAmount]   = useState(String(Math.abs(transaction.amount)));
  const [label,    setLabel]    = useState(transaction.label);
  const [date,     setDate]     = useState(transaction.date || todayStr());
  const [category, setCategory] = useState(transaction.category);

  const handleSave = () => {
    if (!amount || !category || !label) { alert("すべて入力してください"); return; }
    onSave({
      ...transaction,
      type,
      amount:   type==="expense" ? -Number(amount) : Number(amount),
      label, date, category,
    });
  };

  return (
    <div className="pb-20">
      <div className="bg-white px-4 pt-12 pb-4 border-b border-gray-100 flex items-center gap-3">
        <button onClick={onCancel} className="text-gray-400 text-lg">←</button>
        <h1 className="text-xl font-bold text-gray-900">取引を編集</h1>
      </div>
      <div className="px-4 py-5">
        <div className="bg-amber-50 rounded-xl p-3 border border-amber-100 mb-5">
          <p className="text-xs text-amber-700 font-semibold">✏️ 編集中：「{transaction.label}」</p>
        </div>
        <TransactionFormFields
          type={type} setType={setType}
          amount={amount} setAmount={setAmount}
          label={label} setLabel={setLabel}
          date={date} setDate={setDate}
          category={category} setCategory={setCategory}
          categories={categories}
          allRules={allRules || DEFAULT_CATEGORY_RULES}
          learnedRules={learnedRules || []}
          editMode
        />
        <div className="mt-5">
          <PrimaryButton onClick={handleSave} variant="warning">✅ 更新して保存</PrimaryButton>
        </div>
      </div>
    </div>
  );
}
