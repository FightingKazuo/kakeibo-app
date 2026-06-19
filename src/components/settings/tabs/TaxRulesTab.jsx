import { getAllTaxRules, removeTaxRule } from "../../../services/taxLearning";

export function TaxRulesTab() {
  const taxRules = getAllTaxRules();
  const entries  = Object.entries(taxRules);

  return (
    <div className="px-4 py-4 space-y-4">
      <p className="text-xs text-gray-500 leading-relaxed">
        OCRレシート登録時に品目合計とレシート合計の差額から自動学習した税率情報です。
      </p>

      {entries.length === 0 ? (
        <div className="bg-gray-50 rounded-2xl p-6 text-center border border-gray-100">
          <p className="text-3xl mb-2">🧾</p>
          <p className="text-sm font-semibold text-gray-600">学習データなし</p>
          <p className="text-xs text-gray-400 mt-1">品目付きのレシートをOCRで登録すると自動学習されます</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl overflow-hidden border border-gray-100">
          {entries.map(([store, rule]) => (
            <div key={store} className="flex items-center justify-between px-4 py-3 border-b border-gray-50 last:border-b-0">
              <div>
                <p className="text-sm font-medium text-gray-800">{store}</p>
                <p className="text-xs text-gray-400 mt-0.5">
                  {rule.type === "inclusive" ? "税込み表示" :
                   rule.type === "exclusive" ? `税抜き（${Math.round(rule.rate * 100)}%）` :
                   rule.type === "mixed"     ? `軽減税率混在（${Math.round(rule.rate * 100)}%）` : ""}
                  · {rule.samples}回学習 · {rule.learnedAt?.slice(0, 10)}
                </p>
              </div>
              <button onClick={() => removeTaxRule(store)} className="text-gray-300 hover:text-rose-400 text-xl">×</button>
            </div>
          ))}
        </div>
      )}

      <div className="bg-blue-50 rounded-xl p-3 border border-blue-100">
        <p className="text-xs font-semibold text-blue-600 mb-1">💡 学習の仕組み</p>
        <p className="text-xs text-blue-500 leading-relaxed">
          品目合計とレシート合計の差から税率を自動推定します。同じ店で複数回登録するほど精度が上がります。
        </p>
      </div>
    </div>
  );
}
