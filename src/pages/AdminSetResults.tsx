import { useEffect, useMemo, useState } from "react";
import { collection, doc, getDoc, getDocs, serverTimestamp, setDoc, writeBatch } from "firebase/firestore";
import { db } from "../lib/firebase";
import { useLeague } from "../league/LeagueProvider";
import { useParams } from "react-router-dom";
import { computeUserWeekScore, computeWinner, type GameDoc } from "../lib/scoring";
import { listScoresBySportKey, NCAAF_KEY } from "../lib/oddsApi";
import { FALLBACK_WEEK_ID, formatWeekLabel, rememberLastWeekId } from "../lib/weeks";
import { getFunctions, httpsCallable } from "firebase/functions";

type UiGame = GameDoc & {
  name: string;
  startTime: string;
  home?: string;
  away?: string;
};

export default function AdminSetResults() {
  const { leagueId } = useLeague();
  const { weekId = FALLBACK_WEEK_ID } = useParams();
  const [games, setGames] = useState<UiGame[]>([]);
  const [tiebreakerEventKey, setTiebreakerEventKey] = useState<string>("");
  const [sportKey, setSportKey] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  const wref = useMemo(() => (leagueId ? doc(db, "leagues", leagueId, "weeks", weekId) : null), [leagueId, weekId]);

  useEffect(() => {
    if (leagueId && weekId) rememberLastWeekId(leagueId, weekId);
  }, [leagueId, weekId]);

  useEffect(() => {
    if (!wref) return;
    (async () => {
      const ws = await getDoc(wref);
      const wd = ws.data() as any;
      setTiebreakerEventKey(wd?.tiebreakerEventKey || "");
      setSportKey(wd?.sportKey ?? null);
      const gs = await getDocs(collection(wref, "games"));
      const list: UiGame[] = gs.docs.map((d) => {
        const data = d.data() as any;
        return {
          eventKey: d.id,
          name: data.name,
          startTime: data.startTime,
          home: data.home,
          away: data.away,
          finalScoreHome: data.finalScoreHome ?? null,
          finalScoreAway: data.finalScoreAway ?? null,
          winner: data.winner ?? null,
          decided: Boolean(data.decided),
        };
      });
      setGames(list.sort((a,b)=>+new Date(a.startTime)-+new Date(b.startTime)));
    })();
  }, [wref]);

  async function updateGameScores(eventKey: string, home: number | null, away: number | null) {
    if (!wref) return;
    const winner = computeWinner(home, away);
    const decided = winner != null;
    await setDoc(doc(wref, "games", eventKey), {
      finalScoreHome: home,
      finalScoreAway: away,
      winner,
      decided,
      updatedAt: serverTimestamp(),
    }, { merge: true });
    setGames((gs) => gs.map((g) => g.eventKey === eventKey ? { ...g, finalScoreHome: home, finalScoreAway: away, winner, decided } : g));
  }

  async function forceServerSync() {
    if (!leagueId) return;
    setSaving(true); setMsg("");
    try {
      const fn = httpsCallable(getFunctions(undefined, 'us-central1'), "adminSyncWeekResults");
      const res: any = await fn({ leagueId, weekId });
      if (res?.data?.ok) {
        setMsg("Server sync started. Refreshing data...");
        // Reload current games and recompute locally to reflect changes ASAP
        await syncFromApi();
      } else {
        setMsg(res?.data?.error || "Server sync failed");
      }
    } catch (e: any) {
      console.error(e);
      setMsg(e?.message || "Failed to call server sync");
    } finally {
      setSaving(false);
    }
  }

  async function syncFromApi() {
    if (!wref) return;
    setSaving(true); setMsg("");
    try {
      // Determine a reasonable window to query completed games
      const minStart = games.length ? Math.min(...games.map(g => +new Date(g.startTime))) : Date.now();
      const daysFrom = Math.max(0, Math.min(30, Math.ceil((Date.now() - minStart) / (24*60*60*1000)) + 1));

      // Fetch scores (only for this week's event ids) and index by event id
      const eventIds = games.map(g => g.eventKey);
      const key = sportKey || NCAAF_KEY; // default to NCAAF if not set
      const scores = await listScoresBySportKey(key, { daysFrom, eventIds });
      const byId: Record<string, typeof scores[number]> = Object.fromEntries(scores.map(s => [s.id, s]));

      // Prepare updates for games that have final scores
      const batch = writeBatch(db);
      let updated = 0;
      for (const g of games) {
        const ev = byId[g.eventKey];
        const sc = ev?.scores;
        if (!sc || sc.length < 2) continue;
        const findScore = (team?: string) => {
          if (!team) return null;
          const entry = sc.find(x => x.name === team);
          if (!entry) return null;
          const n = Number((entry as any).score);
          return Number.isFinite(n) ? n : null;
        };
        const home = findScore(g.home);
        const away = findScore(g.away);
        if (home == null || away == null) continue;
        const w = computeWinner(home, away);
        const decided = w != null;
        batch.set(doc(wref, "games", g.eventKey), {
          finalScoreHome: home,
          finalScoreAway: away,
          winner: w,
          decided,
          updatedAt: serverTimestamp(),
        }, { merge: true });
        updated += 1;
      }
      if (updated > 0) {
        await batch.commit();
        // Reflect updates locally
        setGames(gs => gs.map(g => {
          const ev = byId[g.eventKey];
          const sc = ev?.scores;
          if (!sc || sc.length < 2) return g;
          const getN = (team?: string) => {
            const entry = sc.find(x => x.name === team);
            const n = entry ? Number((entry as any).score) : NaN;
            return Number.isFinite(n) ? n : null;
          };
          const home = getN(g.home);
          const away = getN(g.away);
          if (home == null || away == null) return g;
          const w = computeWinner(home, away);
          return { ...g, finalScoreHome: home, finalScoreAway: away, winner: w, decided: w != null };
        }));

        // Compute week scores + leaderboard after syncing
        await recomputeWeek();
        setMsg(`Synced ${updated} games from API and recomputed.`);
      } else {
        setMsg("No completed games found to sync.");
      }
    } catch (e: any) {
      console.error(e);
      setMsg(e?.message || "Failed to sync from API.");
    } finally {
      setSaving(false);
    }
  }

  async function setWinnerOnly(eventKey: string, w: "home" | "away") {
    if (!wref) return;
    await setDoc(doc(wref, "games", eventKey), { winner: w, decided: true, updatedAt: serverTimestamp() }, { merge: true });
    setGames((gs) => gs.map((g) => g.eventKey === eventKey ? { ...g, winner: w, decided: true } : g));
  }

  async function simulateFinals() {
    if (!wref) return;
    setSaving(true); setMsg("");
    try {
      const batch = writeBatch(db);
      let changed = 0;
      const nextGames: UiGame[] = games.map((g) => {
        if (g.decided) return g;
        // Generate plausible football-style scores
        const h = Math.floor(Math.random() * 31) + 10; // 10-40
        const a = Math.floor(Math.random() * 31) + 10; // 10-40
        const winner = computeWinner(h, a);
        const decided = winner != null;
        batch.set(doc(wref, "games", g.eventKey), {
          finalScoreHome: h,
          finalScoreAway: a,
          winner,
          decided,
          updatedAt: serverTimestamp(),
        }, { merge: true });
        changed += 1;
        return { ...g, finalScoreHome: h, finalScoreAway: a, winner, decided };
      });
      if (changed > 0) {
        await batch.commit();
        setGames(nextGames);
        await recomputeWeek();
        setMsg(`Simulated finals for ${changed} games and recomputed.`);
      } else {
        setMsg("All games already decided.");
      }
    } catch (e: any) {
      console.error(e);
      setMsg(e?.message || "Failed to simulate finals.");
    } finally {
      setSaving(false);
    }
  }

  async function saveTiebreakerKey() {
    if (!wref) return;
    await setDoc(wref, { tiebreakerEventKey, updatedAt: serverTimestamp() }, { merge: true });
    setMsg("Tiebreaker saved.");
  }

  async function recomputeWeek() {
    if (!wref || !leagueId) return;
    setSaving(true); setMsg("");
    try {
      // Load settings from league root doc
      const leagueRef = doc(db, "leagues", leagueId);
      const ss = await getDoc(leagueRef);
      const settings = (ss.data() as any) || {};

      // Load games
      const gs = await getDocs(collection(wref, "games"));
      const gamesList: GameDoc[] = gs.docs.map((d) => {
        const data = d.data() as any;
        return {
          eventKey: d.id,
          home: data.home,
          away: data.away,
          finalScoreHome: data.finalScoreHome ?? null,
          finalScoreAway: data.finalScoreAway ?? null,
          winner: data.winner ?? null,
          decided: Boolean(data.decided),
        } as GameDoc;
      });

      // Load user picks
      const ups = await getDocs(collection(wref, "userPicks"));
      const batch = writeBatch(db);
      ups.docs.forEach((ud) => {
        const data = ud.data() as any;
        const picks = (data.selections || {}) as Record<string, "home" | "away">;
        const tbPred = typeof data.tiebreaker === "number" ? data.tiebreaker : null;
        const score = computeUserWeekScore(picks, gamesList, { pointsPerCorrect: settings.pointsPerCorrect ?? 1 }, settings.tiebreakerEventKey || tiebreakerEventKey || undefined, tbPred);
        const sdoc = doc(wref, "scores", ud.id);
        batch.set(sdoc, {
          correct: score.correct,
          points: score.points,
          tiebreakerPrediction: score.tiebreakerPrediction,
          tiebreakerActual: score.tiebreakerActual,
          tiebreakerAbsError: score.tiebreakerAbsError,
          updatedAt: serverTimestamp(),
        }, { merge: true });
      });
      await batch.commit();

      // Recompute simple leaderboard by summing all week scores
      // Storage-efficient but read-heavy for many weeks; acceptable for now
      const weeksSnap = await getDocs(collection(doc(db, "leagues", leagueId), "weeks"));
      const totals: Record<string, { totalPoints: number; totalCorrect: number }> = {};
      for (const wk of weeksSnap.docs) {
        const scoresSnap = await getDocs(collection(wk.ref, "scores"));
        scoresSnap.forEach((sd) => {
          const d = sd.data() as any;
          const t = (totals[sd.id] ||= { totalPoints: 0, totalCorrect: 0 });
          t.totalPoints += Number(d.points || 0);
          t.totalCorrect += Number(d.correct || 0);
        });
      }
      const lboardCol = collection(doc(db, "leagues", leagueId), "leaderboard", "current", "users");
      const lbBatch = writeBatch(db);
      Object.entries(totals).forEach(([uid, agg]) => {
        lbBatch.set(doc(lboardCol, uid), { ...agg, updatedAt: serverTimestamp() }, { merge: true });
      });
      await lbBatch.commit();

    } finally {
      setSaving(false);
      setMsg("Recomputed week scores and leaderboard.");
    }
  }

  if (!leagueId) return <div className="p-6">Select or create a league first.</div>;

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-4">
      <div className="flex items-center gap-3">
        <h1 className="text-2xl font-semibold mr-auto">Set Results — {formatWeekLabel(weekId)}</h1>
        <button className="btn" disabled={saving} onClick={simulateFinals}>Simulate Finals</button>
        <button className="btn" disabled={saving} onClick={syncFromApi}>Sync Scores from API</button>
        <button className="btn" disabled={saving} onClick={forceServerSync}>Sync Results Now (Server)</button>
        <button className="btn" disabled={saving} onClick={recomputeWeek}>{saving?"Recomputing…":"Recompute Week Scores"}</button>
      </div>
      {msg && <div className="text-emerald-700 text-sm">{msg}</div>}

      <div className="card">
        <div className="font-medium mb-1">Tiebreaker Game</div>
        <div className="flex items-center gap-2">
          <select className="border rounded px-2 py-1" value={tiebreakerEventKey} onChange={(e)=>setTiebreakerEventKey(e.target.value)}>
            <option value="">— Select game —</option>
            {games.map(g => (
              <option key={g.eventKey} value={g.eventKey}>{g.name}</option>
            ))}
          </select>
          <button className="btn" onClick={saveTiebreakerKey}>Save</button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {games.map((g) => (
          <div key={g.eventKey} className={`card ${g.decided?"ring-1 ring-emerald-600 bg-emerald-50":""}`}>
            <div className="font-medium">{g.name}</div>
            <div className="text-xs opacity-70">{new Date(g.startTime).toLocaleString()}</div>
            <div className="mt-2 grid grid-cols-2 gap-2 items-end">
              <div>
                <label className="text-xs">Home score</label>
                <input type="number" className="border rounded px-2 py-1 w-full" value={g.finalScoreHome ?? ''} onChange={(e)=>{
                  const val = e.target.value === '' ? null : Number(e.target.value);
                  setGames((gs)=>gs.map(x=>x.eventKey===g.eventKey?{...x, finalScoreHome: val}:x));
                }} onBlur={()=>updateGameScores(g.eventKey, g.finalScoreHome ?? null, g.finalScoreAway ?? null)} />
              </div>
              <div>
                <label className="text-xs">Away score</label>
                <input type="number" className="border rounded px-2 py-1 w-full" value={g.finalScoreAway ?? ''} onChange={(e)=>{
                  const val = e.target.value === '' ? null : Number(e.target.value);
                  setGames((gs)=>gs.map(x=>x.eventKey===g.eventKey?{...x, finalScoreAway: val}:x));
                }} onBlur={()=>updateGameScores(g.eventKey, g.finalScoreHome ?? null, g.finalScoreAway ?? null)} />
              </div>
            </div>
            <div className="mt-2 flex gap-2">
              <button className={`btn ${g.winner==="home"?"pick-selected":""}`} onClick={()=>setWinnerOnly(g.eventKey, "home")}>
                {g.home || "Home"}
              </button>
              <button className={`btn ${g.winner==="away"?"pick-selected":""}`} onClick={()=>setWinnerOnly(g.eventKey, "away")}>
                {g.away || "Away"}
              </button>
              {g.winner && <span className="ml-auto text-xs opacity-70">Winner: {g.winner}</span>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
