// src/components/TiebreakerModal.tsx

export default function TiebreakerModal({
  open,
  value,
  onChange,
  onClose,
}: {
  open: boolean;
  value: number | "";
  onChange: (v: number | "") => void;
  onClose: () => void;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40">
      <div className="bg-white dark:bg-slate-900 rounded-lg shadow-xl p-4 w-80">
        <div className="text-lg font-semibold">Tiebreaker</div>
        <div className="text-sm opacity-70">Predict the point differential (home − away) for the selected game.</div>
        <input
          autoFocus
          type="number"
          className="border rounded px-2 py-1 mt-3 w-full"
          value={value}
          onChange={(e)=>onChange(e.target.value === "" ? "" : Number(e.target.value))}
        />
        <div className="mt-4 flex justify-end gap-2">
          <button className="btn-secondary" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}
