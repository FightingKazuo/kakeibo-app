export function PrimaryButton({ children, onClick, variant="primary", size="md", disabled=false, className="" }) {
  const sizes = {
    md: "w-full py-4 text-base rounded-2xl",
    sm: "w-full py-2.5 text-sm rounded-xl",
    xs: "px-5 py-2 text-xs rounded-xl",
  };
  const variants = {
    primary:  "bg-indigo-500 text-white hover:bg-indigo-600",
    success:  "bg-emerald-500 text-white hover:bg-emerald-600",
    danger:   "bg-rose-500 text-white hover:bg-rose-600",
    warning:  "bg-amber-500 text-white hover:bg-amber-600",
    ghost:    "bg-gray-100 text-gray-700 hover:bg-gray-200",
  };
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`font-bold transition-all duration-200 active:scale-95 ${sizes[size]||sizes.md} ${variants[variant]||variants.primary} ${disabled?"opacity-50 cursor-not-allowed":""} ${className}`}
    >
      {children}
    </button>
  );
}
