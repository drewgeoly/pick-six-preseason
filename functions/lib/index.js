import { initializeApp } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { onCall } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions';
initializeApp();
const db = getFirestore();
// Utilities
const DEFAULT_TZ = 'America/New_York'; // EST default
async function getLeagueTimezone(leagueId) {
    try {
        const snap = await db.doc(`leagues/${leagueId}`).get();
        const tz = snap.data()?.timezone;
        return tz || DEFAULT_TZ;
    }
    catch (e) {
        logger.warn('getLeagueTimezone error', e);
        return DEFAULT_TZ;
    }
}
async function recomputeWeekScores(leagueId, weekId) {
    const weekRef = db.doc(`leagues/${leagueId}/weeks/${weekId}`);
    const gamesSnap = await db.collection(weekRef.path + '/games').get();
    const games = gamesSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
    const picksSnap = await db.collection(weekRef.path + '/userPicks').get();
    const membersSnap = await db.collection(`leagues/${leagueId}/members`).get();
    const winnerByEvent = {};
    for (const g of games) {
        if (g.decided === true) {
            if (typeof g.finalScoreHome === 'number' && typeof g.finalScoreAway === 'number') {
                if (g.finalScoreHome > g.finalScoreAway)
                    winnerByEvent[g.id] = 'home';
                else if (g.finalScoreAway > g.finalScoreHome)
                    winnerByEvent[g.id] = 'away';
                else
                    winnerByEvent[g.id] = 'tie';
            }
        }
    }
    // Count decided, non-tie games once; use as "total" for all users
    const decidedNonTieCount = games.filter((g) => g.decided === true && g.winner && g.winner !== 'tie').length;
    const batch = db.bulkWriter();
    for (const docSnap of picksSnap.docs) {
        const uid = docSnap.id;
        const data = docSnap.data();
        let correct = 0;
        let total = decidedNonTieCount;
        for (const [ek, side] of Object.entries(data.selections || {})) {
            const w = winnerByEvent[ek];
            if (w && w !== 'tie' && w === side)
                correct += 1;
        }
        const scoreRef = db.doc(`${weekRef.path}/scores/${uid}`);
        batch.set(scoreRef, { correct, total, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    }
    // Ensure zero scores for members who did not pick
    const pickedUids = new Set(picksSnap.docs.map(d => d.id));
    for (const m of membersSnap.docs) {
        const uid = m.id;
        if (!pickedUids.has(uid)) {
            const scoreRef = db.doc(`${weekRef.path}/scores/${uid}`);
            batch.set(scoreRef, { correct: 0, total: decidedNonTieCount, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
        }
    }
    await batch.close();
    // If all games are decided, mark week final
    const allDecided = games.length > 0 && games.every((g) => g.decided === true);
    if (allDecided) {
        await weekRef.set({ status: 'final', finalizedAt: FieldValue.serverTimestamp() }, { merge: true });
        // Auto-advance currentWeekId for this league if possible
        try {
            const weeksSnap = await db.collection(`leagues/${leagueId}/weeks`).get();
            const weekIds = weeksSnap.docs.map(d => d.id).sort();
            const idx = weekIds.indexOf(weekId);
            const nextId = idx >= 0 && idx + 1 < weekIds.length ? weekIds[idx + 1] : undefined;
            if (nextId) {
                const leagueRef = db.doc(`leagues/${leagueId}`);
                await leagueRef.set({ currentWeekId: nextId, lastAdvancedAt: FieldValue.serverTimestamp() }, { merge: true });
            }
        }
        catch (e) {
            logger.warn('auto-advance failed', e);
        }
    }
}
// Compute and roll-up season aggregates (Stroke totals for now)
async function recomputeSeasonAggregates(leagueId) {
    const weeksSnap = await db.collection(`leagues/${leagueId}/weeks`).get();
    const finalizedWeekIds = weeksSnap.docs.filter(d => d.data()?.status === 'final').map(d => d.id);
    if (!finalizedWeekIds.length)
        return;
    // uid -> { correct, total }
    const byUser = {};
    for (const wid of finalizedWeekIds) {
        const scoresSnap = await db.collection(`leagues/${leagueId}/weeks/${wid}/scores`).get();
        for (const s of scoresSnap.docs) {
            const uid = s.id;
            const data = s.data();
            if (!byUser[uid])
                byUser[uid] = { correct: 0, total: 0 };
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
function normalizeTeam(name) {
    return (name || '').toLowerCase().replace(/\./g, '').replace(/\s+/g, ' ').trim();
}
function determineWinnerFromScores(s) {
    if (!s.completed || !s.scores || s.scores.length < 2)
        return undefined;
    // Odds API may not guarantee order; map by team name
    const homeName = normalizeTeam(s.home_team);
    const awayName = normalizeTeam(s.away_team);
    const findBy = (n) => s.scores.find(x => normalizeTeam(x.name) === n);
    const hs = findBy(homeName)?.score;
    const as = findBy(awayName)?.score;
    const fh = typeof hs === 'string' ? parseInt(hs, 10) : hs;
    const fa = typeof as === 'string' ? parseInt(as, 10) : as;
    if (typeof fh !== 'number' || typeof fa !== 'number')
        return undefined;
    if (fh > fa)
        return 'home';
    if (fa > fh)
        return 'away';
    return 'tie';
}
async function fetchNcaafScores(daysFrom = 3, eventIds) {
    const apiKey = process.env.ODDS_API_KEY;
    if (!apiKey) {
        logger.warn('ODDS_API_KEY not set; skipping results ingestion');
        return [];
    }
    const url = new URL(`https://api.the-odds-api.com/v4/sports/americanfootball_ncaaf/scores`);
    url.searchParams.set('apiKey', apiKey);
    url.searchParams.set('daysFrom', String(daysFrom));
    url.searchParams.set('dateFormat', 'iso');
    if (eventIds && eventIds.length) {
        for (const id of eventIds)
            url.searchParams.append('eventIds', id);
    }
    try {
        const res = await fetch(url.toString());
        if (!res.ok) {
            logger.warn('fetchNcaafScores non-200', res.status, await res.text());
            return [];
        }
        const data = await res.json();
        return Array.isArray(data) ? data : [];
    }
    catch (e) {
        logger.error('fetchNcaafScores error', e);
        return [];
    }
}
async function updateFinishedGamesFromOddsApi(leagueId, weekId) {
    const weekRef = db.doc(`leagues/${leagueId}/weeks/${weekId}`);
    const gamesSnap = await db.collection(weekRef.path + '/games').get();
    const games = gamesSnap.docs.map(d => ({ id: d.id, ref: d.ref, ...d.data() }));
    // Fetch by eventIds to ensure we can get results even if the game is older than daysFrom window
    const eventIds = games.map(g => g.id);
    let oddsScores = await fetchNcaafScores(6, eventIds);
    if (!oddsScores.length) {
        // fallback: look back two weeks
        oddsScores = await fetchNcaafScores(14, eventIds);
    }
    if (!oddsScores.length)
        return;
    // Build quick lookup by normalized names and kickoff date
    function keyize(nameA, nameH, iso) {
        const dt = iso ? new Date(iso).toISOString().slice(0, 10) : '';
        return `${normalizeTeam(nameA)}@${normalizeTeam(nameH)}#${dt}`;
    }
    const scoreMap = new Map();
    for (const s of oddsScores) {
        const k = keyize(s.away_team, s.home_team, s.commence_time);
        scoreMap.set(k, s);
    }
    // Also map by event id if present so we can match by our eventKey directly
    const scoreById = new Map();
    for (const s of oddsScores) {
        if (s.id)
            scoreById.set(s.id, s);
    }
    const writer = db.bulkWriter();
    for (const g of games) {
        if (g.decided === true)
            continue;
        // Prefer matching by the Odds API event id
        let s = scoreById.get(g.eventKey);
        if (!s) {
            const k = keyize(g.away, g.home, g.startTime);
            s = scoreMap.get(k);
        }
        if (!s || !s.completed)
            continue;
        const winner = determineWinnerFromScores(s);
        if (!winner)
            continue;
        // Extract scores for home/away
        const getScore = (team) => {
            const n = normalizeTeam(team);
            const found = s.scores?.find(x => normalizeTeam(x.name) === n)?.score;
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
        const league = lg.data();
        const currentWeekId = league.currentWeekId;
        if (!currentWeekId)
            continue;
        const curWeekRef = db.doc(`leagues/${leagueId}/weeks/${currentWeekId}`);
        const curWeek = (await curWeekRef.get()).data();
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
        const league = lg.data();
        const weekId = league.currentWeekId;
        if (!weekId)
            continue;
        // Update finished games via Odds API (uses ODDS_API_KEY secret)
        await updateFinishedGamesFromOddsApi(leagueId, weekId);
        await recomputeWeekScores(leagueId, weekId);
        await recomputeSeasonAggregates(leagueId);
    }
});
// Trigger: when a game is written (created/updated), recompute scores
export const onGameWrite = onDocumentWritten('leagues/{leagueId}/weeks/{weekId}/games/{gameId}', async (event) => {
    const { leagueId, weekId } = event.params;
    try {
        await recomputeWeekScores(leagueId, weekId);
        await recomputeSeasonAggregates(leagueId);
    }
    catch (e) {
        logger.error('onGameWrite recompute error', e);
    }
});
// Callable: Send pick reminders to members who haven't completed picks for the given week
export const sendPickReminders = onCall(async (request) => {
    const { leagueId, weekId } = request.data || {};
    if (!leagueId || !weekId) {
        throw new Error('leagueId and weekId are required');
    }
    const leagueRef = db.doc(`leagues/${leagueId}`);
    const league = (await leagueRef.get()).data();
    if (!league)
        throw new Error('League not found');
    const membersSnap = await db.collection(`leagues/${leagueId}/members`).get();
    const memberList = membersSnap.docs.map(d => ({ uid: d.id, ...d.data() }));
    const picksColPath = `leagues/${leagueId}/weeks/${weekId}/userPicks`;
    const picksSnap = await db.collection(picksColPath).get();
    const picksByUid = {};
    for (const p of picksSnap.docs)
        picksByUid[p.id] = p.data();
    const missing = [];
    for (const m of memberList) {
        const p = picksByUid[m.uid];
        const selections = p?.selections ? Object.keys(p.selections) : [];
        const tb = p?.tiebreaker;
        const complete = selections.length === 6 && typeof tb === 'number';
        if (!complete)
            missing.push({ uid: m.uid, email: m.email, name: m.displayName || m.name });
    }
    if (!missing.length)
        return { sent: 0, message: 'All members have completed picks.' };
    const sendgridKey = process.env.SENDGRID_API_KEY;
    if (!sendgridKey) {
        logger.warn('SENDGRID_API_KEY not set. Logging recipients instead of emailing. Missing:', missing);
        return { sent: 0, logged: missing.length };
    }
    // Send via SendGrid
    const emails = missing.filter(m => m.email).map(m => ({ to: m.email, name: m.name || '' }));
    if (!emails.length)
        return { sent: 0, message: 'No emails on file for missing members.' };
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
    }
    catch (e) {
        logger.error('SendGrid send error', e);
        return { sent: 0, message: 'Send error' };
    }
});
