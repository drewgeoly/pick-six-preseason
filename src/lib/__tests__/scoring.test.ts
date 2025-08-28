import { describe, it, expect } from 'vitest';
import {
  computeWinner,
  isPickCorrect,
  computeTiebreakerActual,
  computeUserWeekScore,
  type GameDoc,
} from '../scoring';

function game(partial: Partial<GameDoc>): GameDoc {
  return {
    eventKey: partial.eventKey || 'ek',
    home: partial.home,
    away: partial.away,
    finalScoreHome: partial.finalScoreHome,
    finalScoreAway: partial.finalScoreAway,
    winner: partial.winner ?? null,
    decided: partial.decided ?? false,
  } as GameDoc;
}

describe('computeWinner', () => {
  it('returns null when scores missing', () => {
    expect(computeWinner(null, 10)).toBeNull();
    expect(computeWinner(7, null)).toBeNull();
  });
  it('determines home/away/tie correctly', () => {
    expect(computeWinner(21, 17)).toBe('home');
    expect(computeWinner(14, 24)).toBe('away');
    expect(computeWinner(10, 10)).toBe('tie');
  });
});

describe('isPickCorrect', () => {
  it('returns pending when not decided', () => {
    const g = game({ eventKey: 'a', decided: false });
    expect(isPickCorrect('home', g)).toBe('pending');
  });
  it('returns correct/incorrect when decided', () => {
    const g = game({ eventKey: 'a', decided: true, finalScoreHome: 20, finalScoreAway: 17 });
    expect(isPickCorrect('home', g)).toBe('correct');
    expect(isPickCorrect('away', g)).toBe('incorrect');
  });
  it('returns tie when tied', () => {
    const g = game({ eventKey: 'a', decided: true, finalScoreHome: 21, finalScoreAway: 21 });
    expect(isPickCorrect('home', g)).toBe('tie');
    expect(isPickCorrect('away', g)).toBe('tie');
  });
  it('returns pending if no pick', () => {
    const g = game({ eventKey: 'a', decided: true, finalScoreHome: 28, finalScoreAway: 14 });
    expect(isPickCorrect(undefined, g)).toBe('pending');
  });
});

describe('computeTiebreakerActual', () => {
  it('computes point differential (home - away)', () => {
    const g = game({ eventKey: 'tb', finalScoreHome: 27, finalScoreAway: 20 });
    expect(computeTiebreakerActual(g)).toBe(7);
  });
  it('returns null if scores missing', () => {
    const g = game({ eventKey: 'tb' });
    expect(computeTiebreakerActual(g)).toBeNull();
  });
});

describe('computeUserWeekScore', () => {
  const games: GameDoc[] = [
    game({ eventKey: 'g1', decided: true, finalScoreHome: 24, finalScoreAway: 20 }), // home wins
    game({ eventKey: 'g2', decided: true, finalScoreHome: 10, finalScoreAway: 17 }), // away wins
    game({ eventKey: 'g3', decided: true, finalScoreHome: 14, finalScoreAway: 14 }), // tie
  ];

  it('counts only decided non-tie correct picks (default points=1)', () => {
    const picks = { g1: 'home', g2: 'home', g3: 'away' } as const; // 1 correct (g1), g2 wrong, g3 tie
    const score = computeUserWeekScore(picks, games, { pointsPerCorrect: 1 });
    expect(score.correct).toBe(1);
    expect(score.points).toBe(1);
  });

  it('applies pointsPerCorrect setting', () => {
    const picks = { g1: 'home', g2: 'away' } as const; // 2 correct
    const score = computeUserWeekScore(picks, games, { pointsPerCorrect: 3 });
    expect(score.correct).toBe(2);
    expect(score.points).toBe(6);
  });

  it('computes tiebreaker absolute error when both actual and prediction exist', () => {
    const tbGames: GameDoc[] = [
      ...games,
      game({ eventKey: 'tb', decided: true, finalScoreHome: 27, finalScoreAway: 20 }), // actual diff = 7
    ];
    const picks = { g1: 'home', g2: 'away' } as const;
    const score = computeUserWeekScore(picks, tbGames, { pointsPerCorrect: 1 }, 'tb', 10);
    expect(score.tiebreakerActual).toBe(7);
    expect(score.tiebreakerPrediction).toBe(10);
    expect(score.tiebreakerAbsError).toBe(3);
  });
});
