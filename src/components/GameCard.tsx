// src/components/GameCard.tsx
import { isPickCorrect, type GameDoc, type PickVerdict } from "../lib/scoring";

export type GameCardGame = { eventKey: string; startTime: string; home?: string; away?: string } & Partial<GameDoc>;

export function verdictClass(v: PickVerdict, selected: boolean) {
  if (!selected) return "";
  if (v === "correct") return "ring-2 ring-emerald-600 bg-emerald-50";
  if (v === "incorrect") return "ring-2 ring-red-600 bg-red-50";
  if (v === "tie") return "ring-2 ring-gray-500 bg-gray-50";
  return "";
}

export default function GameCard({
  game,
  choice,
  onChoose,
  canEdit,
  spreads,
  index,
}: {
  game: GameCardGame;
  choice?: "home" | "away";
  onChoose: (side: "home" | "away") => void;
  canEdit: boolean;
  index?: number;
  spreads?: { home?: { point: number | null; price: number | null }; away?: { point: number | null; price: number | null } };
}) {
  const v = isPickCorrect(choice, game as any);
  const fmtSpread = (point?: number | null, price?: number | null) => {
    if (point == null && price == null) return "";
    const p = point != null ? (point > 0 ? `+${point}` : `${point}`) : "";
    const pr = price != null ? (price > 0 ? ` (+${price})` : ` (${price})`) : "";
    return `${p}${pr}`.trim();
  };

  const hasSpreads = (spreads?.home?.point != null) || (spreads?.away?.point != null);
  const cardClass = `card ${hasSpreads ? 'tinted-card' : ''}`;

  return (
    <div className={cardClass}>
      <div className="flex items-center justify-between">
        <div className="font-medium">{(game.away || "Away")} @ {(game.home || "Home")}</div>
        <div className="text-xs opacity-60">{new Date(game.startTime).toLocaleString()}</div>
      </div>
      {game.decided && (
        <div className="mt-1 text-xs">
          <span className="inline-block rounded bg-emerald-50 text-emerald-700 px-2 py-0.5 mr-2">Winner:</span>
          {(() => {
            const fh = (game as any).finalScoreHome as number | undefined;
            const fa = (game as any).finalScoreAway as number | undefined;
            if (typeof fh === "number" && typeof fa === "number") {
              if (fh > fa) return <span className="font-medium">{game.home || "Home"}</span>;
              if (fa > fh) return <span className="font-medium">{game.away || "Away"}</span>;
              return <span className="font-medium">Tie</span>;
            }
            return null;
          })()}
        </div>
      )}
      <div className="mt-2 flex gap-2 items-center">
        <button
          disabled={!canEdit}
          className={`pick-btn ${choice === "away" ? "pick-selected" : choice === "home" ? "pick-dim" : ""} ${verdictClass(v, choice === "away")}`}
          onClick={() => onChoose("away")}
          aria-pressed={choice === "away"}
        >
          <div className="flex flex-col items-start">
            <span>
              {game.away || "Away"} <span className="text-[10px] opacity-70">(Away)</span>
            </span>
            <span className="text-[11px] opacity-80">{fmtSpread(spreads?.away?.point ?? null, spreads?.away?.price ?? null)}</span>
            {game.decided && choice === "away" && (
              <span className="text-[11px] font-medium">{(game as any).finalScoreAway ?? ""}–{(game as any).finalScoreHome ?? ""}</span>
            )}
          </div>
        </button>
        <button
          disabled={!canEdit}
          className={`pick-btn ${choice === "home" ? "pick-selected" : choice === "away" ? "pick-dim" : ""} ${verdictClass(v, choice === "home")}`}
          onClick={() => onChoose("home")}
          aria-pressed={choice === "home"}
        >
          <div className="flex flex-col items-start">
            <span>
              {game.home || "Home"} <span className="text-[10px] opacity-70">(Home)</span>
            </span>
            <span className="text-[11px] opacity-80">{fmtSpread(spreads?.home?.point ?? null, spreads?.home?.price ?? null)}</span>
            {game.decided && choice === "home" && (
              <span className="text-[11px] font-medium">{(game as any).finalScoreHome ?? ""}–{(game as any).finalScoreAway ?? ""}</span>
            )}
          </div>
        </button>
        {typeof index === "number" && <span className="ml-auto text-xs opacity-60">Game {index + 1}</span>}
      </div>
    </div>
  );
}
