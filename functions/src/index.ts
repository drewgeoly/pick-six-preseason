import { initializeApp } from 'firebase-admin/app';
import { getFirestore, FieldValue, QueryDocumentSnapshot } from 'firebase-admin/firestore';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { onCall } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions';

initializeApp();
const db = getFirestore();

// Utilities
const DEFAULT_TZ = 'America/New_York'; // EST default

async function getLeagueTimezone(leagueId: string): Promise<string> {
  try {
    const snap = await db.doc(`leagues/${leagueId}`).get();
    const tz = (snap.data() as any)?.timezone;
    return tz || DEFAULT_TZ;
  } catch (e) {
    logger.warn('getLeagueTimezone error', e);
    return DEFAULT_TZ;
  }
}

async function recomputeWeekScores(leagueId: string, weekId: string): Promise<void> {
  const weekRef = db.doc(`leagues/${leagueId}/weeks/${weekId}`);
  const gamesSnap = await db.collection(weekRef.path + '/games').get();
  const games = gamesSnap.docs.map((d: QueryDocumentSnapshot) => ({ id: d.id, ...(d.data() as any) }));

  const picksSnap = await db.collection(weekRef.path + '/userPicks').get();

  const winnerByEvent: Record<string, 'home'|'away'|'tie'|undefined> = {};
  for (const g of games as Array<any>) {
    if (g.decided === true) {
      if (typeof g.finalScoreHome === 'number' && typeof g.finalScoreAway === 'number') {
        if (g.finalScoreHome > g.finalScoreAway) winnerByEvent[g.id] = 'home';
        else if (g.finalScoreAway > g.finalScoreHome) winnerByEvent[g.id] = 'away';
        else winnerByEvent[g.id] = 'tie';
      }
    }
  }

  const batch = db.bulkWriter();
  for (const docSnap of picksSnap.docs as Array<QueryDocumentSnapshot>) {
    const uid: string = docSnap.id;
    const data: { selections?: Record<string, 'home'|'away'> } = docSnap.data() as any;
    let correct = 0; let total = 0;
    for (const [ek, side] of Object.entries(data.selections || {})) {
      const w = winnerByEvent[ek];
      if (w) {
        if (w !== 'tie') total += 1; // exclude ties from total by default
        if (w === side) correct += 1;
      }
    }
    const scoreRef = db.doc(`${weekRef.path}/scores/${uid}`);
    batch.set(scoreRef, { correct, total, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  }
  await batch.close();

  // If all games are decided, mark week final
  const allDecided = (games as Array<any>).length > 0 && (games as Array<any>).every((g: any) => g.decided === true);
  if (allDecided) {
    await weekRef.set({ status: 'final', finalizedAt: FieldValue.serverTimestamp() }, { merge: true });
  }
}

// Compute and roll-up season aggregates (Stroke totals for now)
async function recomputeSeasonAggregates(leagueId: string): Promise<void> {
  const weeksSnap = await db.collection(`leagues/${leagueId}/weeks`).get();
  const finalizedWeekIds = weeksSnap.docs.filter(d => (d.data() as any)?.status === 'final').map(d => d.id);
  if (!finalizedWeekIds.length) return;

  // uid -> { correct, total }
  const byUser: Record<string, { correct: number; total: number }> = {};
  for (const wid of finalizedWeekIds) {
    const scoresSnap = await db.collection(`leagues/${leagueId}/weeks/${wid}/scores`).get();
    for (const s of scoresSnap.docs) {
      const uid = s.id;
      const data = s.data() as any;
      if (!byUser[uid]) byUser[uid] = { correct: 0, total: 0 };
      byUser[uid].correct += Number(data.correct || 0);
      byUser[uid].total += Number(data.total || 0);
    }
  }

  const writer = db.bulkWriter();
  for (const [uid, agg] of Object.entries(byUser)) {
    const ref = db.doc(`leagues/${leagueId}/leaderboard/current/users/${uid}`);
    writer.set(ref, {
      strokeCorrect: agg.correct,
      strokeTotal: agg.total,
      // placeholders for future phases
      matchWins: 0,
      playoffWins: 0,
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
  }
  await writer.close();
}

// --- Results ingestion via The Odds API (NCAAF) ---
type OddsScore = {
  id: string;
  sport_key: string;
  commence_time: string; // ISO
  completed: boolean;
  scores?: Array<{ name: string; score: number | string }>; // team names and scores
  home_team?: string;
  away_team?: string;
};

function normalizeTeam(name: string | undefined): string {
  return (name || '').toLowerCase().replace(/\./g, '').replace(/\s+/g, ' ').trim();
}

function determineWinnerFromScores(s: OddsScore): 'home'|'away'|'tie'|undefined {
  if (!s.completed || !s.scores || s.scores.length < 2) return undefined;
  // Odds API may not guarantee order; map by team name
  const homeName = normalizeTeam(s.home_team);
  const awayName = normalizeTeam(s.away_team);
  const findBy = (n: string) => s.scores!.find(x => normalizeTeam(x.name) === n);
  const hs = findBy(homeName)?.score as any;
  const as = findBy(awayName)?.score as any;
  const fh = typeof hs === 'string' ? parseInt(hs, 10) : hs;
  const fa = typeof as === 'string' ? parseInt(as, 10) : as;
  if (typeof fh !== 'number' || typeof fa !== 'number') return undefined;
  if (fh > fa) return 'home';
  if (fa > fh) return 'away';
  return 'tie';
}

async function fetchNcaafScores(daysFrom: number = 3): Promise<OddsScore[]> {
  const apiKey = process.env.ODDS_API_KEY;
  if (!apiKey) {
    logger.warn('ODDS_API_KEY not set; skipping results ingestion');
    return [];
  }
  const url = new URL(`https://api.the-odds-api.com/v4/sports/americanfootball_ncaaf/scores`);
  url.searchParams.set('apiKey', apiKey);
  url.searchParams.set('daysFrom', String(daysFrom));
  url.searchParams.set('dateFormat', 'iso');
  try {
    const res = await fetch(url.toString());
    if (!res.ok) {
      logger.warn('fetchNcaafScores non-200', res.status, await res.text());
      return [];
    }
    const data = await res.json();
    return Array.isArray(data) ? (data as OddsScore[]) : [];
  } catch (e) {
    logger.error('fetchNcaafScores error', e);
    return [];
  }
}

async function updateFinishedGamesFromOddsApi(leagueId: string, weekId: string): Promise<void> {
  const weekRef = db.doc(`leagues/${leagueId}/weeks/${weekId}`);
  const gamesSnap = await db.collection(weekRef.path + '/games').get();
  const games = gamesSnap.docs.map(d => ({ id: d.id, ref: d.ref, ...(d.data() as any) }));

  const oddsScores = await fetchNcaafScores(6); // look back almost a week
  if (!oddsScores.length) return;

  // Build quick lookup by normalized names and kickoff date
  function keyize(nameA?: string, nameH?: string, iso?: string): string {
    const dt = iso ? new Date(iso).toISOString().slice(0, 10) : '';
    return `${normalizeTeam(nameA)}@${normalizeTeam(nameH)}#${dt}`;
  }

  const scoreMap = new Map<string, OddsScore>();
  for (const s of oddsScores) {
    const k = keyize(s.away_team, s.home_team, s.commence_time);
    scoreMap.set(k, s);
  }

  const writer = db.bulkWriter();
  for (const g of games as Array<any>) {
    if (g.decided === true) continue;
    const k = keyize(g.away, g.home, g.startTime);
    const s = scoreMap.get(k);
    if (!s || !s.completed) continue;
    const winner = determineWinnerFromScores(s);
    if (!winner) continue;

    // Extract scores for home/away
    const getScore = (team?: string) => {
      const n = normalizeTeam(team);
      const found = s.scores?.find(x => normalizeTeam(x.name) === n)?.score as any;
      return typeof found === 'string' ? parseInt(found, 10) : found;
    };
    const finalScoreHome = getScore(g.home);
    const finalScoreAway = getScore(g.away);

    writer.set(g.ref, {
      decided: true,
      winner,
      finalScoreHome,
      finalScoreAway,
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
  }
  await writer.close();
}

// Scheduled: Auto-advance week every Sunday in EST
export const advanceWeekSunday = onSchedule({ schedule: '0 9 * * 0', timeZone: DEFAULT_TZ }, async () => {
  // At 9:00 AM every Sunday EST
  // Strategy: find leagues, advance their currentWeekId to next available week if the previous is final.
  const leagues = await db.collection('leagues').get();
  const batch = db.bulkWriter();
  for (const lg of leagues.docs) {
    const leagueId = lg.id;
    const league = lg.data() as any;
    const currentWeekId: string | undefined = league.currentWeekId;
    if (!currentWeekId) continue;
    const curWeekRef = db.doc(`leagues/${leagueId}/weeks/${currentWeekId}`);
    const curWeek = (await curWeekRef.get()).data() as any | undefined;

    // Advance if the current week is final
    if (curWeek?.status === 'final') {
      const weeksSnap = await db.collection(`leagues/${leagueId}/weeks`).get();
      const weekIds = weeksSnap.docs.map(d => d.id).sort();
      const idx = weekIds.indexOf(currentWeekId);
      const nextId = idx >= 0 && idx + 1 < weekIds.length ? weekIds[idx + 1] : undefined;
      if (nextId) {
        const leagueRef = db.doc(`leagues/${leagueId}`);
        batch.set(leagueRef, { currentWeekId: nextId, lastAdvancedAt: FieldValue.serverTimestamp() }, { merge: true });
      }
    }
  }
  await batch.close();
});

// Scheduled: Poll results every 3 minutes
export const pollResultsEvery3Min = onSchedule({ schedule: '*/3 * * * *', timeZone: DEFAULT_TZ }, async () => {
  // NOTE: Integrate with your existing sports API client here.
  // For each league/currentWeek, fetch recently finished games and update game docs with
  // finalScoreHome, finalScoreAway, decided=true, winner.
  // After updates, call recomputeWeekScores and recomputeSeasonAggregates.

  const leagues = await db.collection('leagues').get();
  for (const lg of leagues.docs) {
    const leagueId = lg.id;
    const league = lg.data() as any;
    const weekId: string | undefined = league.currentWeekId;
    if (!weekId) continue;

    // Update finished games via Odds API (uses ODDS_API_KEY secret)
    await updateFinishedGamesFromOddsApi(leagueId, weekId);

    await recomputeWeekScores(leagueId, weekId);
    await recomputeSeasonAggregates(leagueId);
  }
});

// Trigger: when a game is written (created/updated), recompute scores
export const onGameWrite = onDocumentWritten('leagues/{leagueId}/weeks/{weekId}/games/{gameId}', async (event: any) => {
  const { leagueId, weekId } = event.params as { leagueId: string; weekId: string; gameId: string };
  try {
    await recomputeWeekScores(leagueId, weekId);
    await recomputeSeasonAggregates(leagueId);
  } catch (e) {
    logger.error('onGameWrite recompute error', e);
  }
});

// Callable: Send pick reminders to members who haven't completed picks for the given week
export const sendPickReminders = onCall<{ leagueId: string; weekId: string }>(async (request) => {
  const { leagueId, weekId } = request.data || {} as any;
  if (!leagueId || !weekId) {
    throw new Error('leagueId and weekId are required');
  }

  const leagueRef = db.doc(`leagues/${leagueId}`);
  const league = (await leagueRef.get()).data() as any | undefined;
  if (!league) throw new Error('League not found');

  const membersSnap = await db.collection(`leagues/${leagueId}/members`).get();
  const memberList = membersSnap.docs.map(d => ({ uid: d.id, ...(d.data() as any) }));

  const picksColPath = `leagues/${leagueId}/weeks/${weekId}/userPicks`;
  const picksSnap = await db.collection(picksColPath).get();
  const picksByUid: Record<string, any> = {};
  for (const p of picksSnap.docs) picksByUid[p.id] = p.data();

  const missing: Array<{ uid: string; email?: string; name?: string }> = [];
  for (const m of memberList) {
    const p = picksByUid[m.uid];
    const selections = p?.selections ? Object.keys(p.selections) : [];
    const tb = p?.tiebreaker;
    const complete = selections.length === 6 && typeof tb === 'number';
    if (!complete) missing.push({ uid: m.uid, email: m.email, name: m.displayName || m.name });
  }

  if (!missing.length) return { sent: 0, message: 'All members have completed picks.' };

  const sendgridKey = process.env.SENDGRID_API_KEY;
  if (!sendgridKey) {
    logger.warn('SENDGRID_API_KEY not set. Logging recipients instead of emailing. Missing:', missing);
    return { sent: 0, logged: missing.length };
  }

  // Send via SendGrid
  const emails = missing.filter(m => m.email).map(m => ({ to: m.email as string, name: m.name || '' }));
  if (!emails.length) return { sent: 0, message: 'No emails on file for missing members.' };

  try {
    const payload = {
      personalizations: emails.map(e => ({ to: [{ email: e.to, name: e.name }] })),
      from: { email: 'no-reply@picksix.app', name: 'Pick-Six' },
      subject: 'Reminder: Make your Pick-Six picks',
      content: [{ type: 'text/plain', value: `Your league admin asked us to remind you to make your Pick-Six picks for week ${weekId}.` }],
    };
    const res = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${sendgridKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      logger.warn('SendGrid non-200', res.status, await res.text());
      return { sent: 0, message: 'SendGrid error' };
    }
    return { sent: emails.length };
  } catch (e) {
    logger.error('SendGrid send error', e);
    return { sent: 0, message: 'Send error' };
  }
});
