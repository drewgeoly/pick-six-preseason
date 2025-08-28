// src/lib/scoring.ts

export type Winner = "home" | "away" | "tie" | null;

export type GameDoc = {
  eventKey: string;
  home?: string;
  away?: string;
  finalScoreHome?: number | null;
  finalScoreAway?: number | null;
  winner?: Winner;
  decided?: boolean;
};

export type UserPicks = Record<string, "home" | "away">;

export type ScoringSettings = {
  pointsPerCorrect?: number; // default 1
};

export type WeekScore = {
  correct: number;
  points: number;
  tiebreakerPrediction: number | null;
  tiebreakerActual: number | null;
  tiebreakerAbsError: number | null;
};

export function computeWinner(fsHome?: number | null, fsAway?: number | null): Winner {
  if (fsHome == null || fsAway == null) return null;
  if (fsHome === fsAway) return "tie";
  return fsHome > fsAway ? "home" : "away";
}

export type PickVerdict = "correct" | "incorrect" | "pending" | "tie";

export function isPickCorrect(pick: "home"|"away"|undefined, game?: GameDoc): PickVerdict {
  if (!game || !game.decided) return "pending";
  const w = game.winner ?? computeWinner(game.finalScoreHome, game.finalScoreAway);
  if (w === "tie") return "tie";
  if (!pick || !w) return "pending";
  return pick === w ? "correct" : "incorrect";
}

export function computeTiebreakerActual(game?: GameDoc): number | null {
  if (!game) return null;
  if (game.finalScoreHome == null || game.finalScoreAway == null) return null;
  // point differential: home - away
  return (game.finalScoreHome as number) - (game.finalScoreAway as number);
}

export function computeUserWeekScore(
  picks: UserPicks,
  games: GameDoc[],
  settings: ScoringSettings,
  tiebreakerEventKey?: string,
  tiebreakerPrediction?: number | null
): WeekScore {
  const pointsPerCorrect = settings.pointsPerCorrect ?? 1;
  let correct = 0;

  const byId: Record<string, GameDoc> = {};
  games.forEach((g) => (byId[g.eventKey] = g));

  for (const [eventKey, choice] of Object.entries(picks || {})) {
    const g = byId[eventKey];
    if (!g || !g.decided) continue;
    const winner = g.winner ?? computeWinner(g.finalScoreHome, g.finalScoreAway);
    if (winner === "tie") continue; // no points for tie by default
    if (winner && choice === winner) correct += 1;
  }

  const points = correct * pointsPerCorrect;

  const tbGame = tiebreakerEventKey ? byId[tiebreakerEventKey] : undefined;
  const tActual = computeTiebreakerActual(tbGame);
  const tPred = tiebreakerPrediction ?? null;
  const absErr = tActual != null && tPred != null ? Math.abs(tPred - tActual) : null;

  return {
    correct,
    points,
    tiebreakerPrediction: tPred,
    tiebreakerActual: tActual,
    tiebreakerAbsError: absErr,
  };
}
