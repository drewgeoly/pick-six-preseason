import type { ReactNode } from "react";

type CoachTipProps = {
  title: string;
  children: ReactNode;
  action?: ReactNode;
};

export default function CoachTip({ title, children, action }: CoachTipProps) {
  return (
    <div className="rounded-xl border bg-white p-3 shadow-sm">
      <div className="flex items-start gap-3">
        <div className="shrink-0 mt-0.5 w-6 h-6 rounded-full bg-emerald-100 text-emerald-700 grid place-items-center font-bold">i</div>
        <div className="flex-1">
          <div className="font-medium mb-0.5">{title}</div>
          <div className="text-sm text-slate-600">{children}</div>
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
    </div>
  );
}
