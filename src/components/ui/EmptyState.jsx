import { PrimaryButton } from "./PrimaryButton";

export function EmptyState({ emoji="📭", title, desc, actionLabel, onAction }) {
  return (
    <div className="flex flex-col items-center py-16 px-6 text-center space-y-3">
      <span className="text-5xl">{emoji}</span>
      {title && <p className="text-sm font-semibold text-gray-600">{title}</p>}
      {desc  && <p className="text-xs text-gray-400 max-w-xs">{desc}</p>}
      {actionLabel && onAction && (
        <PrimaryButton onClick={onAction} size="xs" className="mt-2">{actionLabel}</PrimaryButton>
      )}
    </div>
  );
}
