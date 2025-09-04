import React, { useEffect } from "react";
import { collection, doc, getDoc, getDocs, serverTimestamp, setDoc, writeBatch } from "firebase/firestore";
import { db } from "../lib/firebase";
import { useLeague } from "../league/LeagueProvider";
import { useParams } from "react-router-dom";
import { computeUserWeekScore, type GameDoc } from "../lib/scoring";
import { FALLBACK_WEEK_ID } from "../lib/weeks";

export default function AdminScoring() {
  const { leagueId } = useLeague();
  const { weekId = FALLBACK_WEEK_ID } = useParams();
  const [pointsPerCorrect, setPointsPerCorrect] = React.useState<number>(1);
  const [saving, setSaving] = React.useState(false);
  const [msg, setMsg] = React.useState("");

  useEffect(() => {
    if (!leagueId) return;
    (async () => {
      const leagueRef = doc(db, "leagues", leagueId);
      const ss = await getDoc(leagueRef);
      const s = (ss.data() as any) || {};
      setPointsPerCorrect(Number(s.pointsPerCorrect ?? 1));
    })();
  }, [leagueId]);

  async function saveSettings() {
    if (!leagueId) return;
    setSaving(true); setMsg("");
    await setDoc(doc(db, "leagues", leagueId), {
      pointsPerCorrect: Number(pointsPerCorrect) || 1,
      tiebreakerType: "point_differential",
      updatedAt: serverTimestamp(),
    }, { merge: true });
    setSaving(false);
    setMsg("Settings saved.");
  }

  async function recomputeWeek() {
    if (!leagueId) return;
    setSaving(true); setMsg("");
    const wref = doc(db, "leagues", leagueId, "weeks", weekId);
    const leagueRef = doc(db, "leagues", leagueId);
    const [ws, ss] = await Promise.all([getDoc(wref), getDoc(leagueRef)]);
    const settings = (ss.data() as any) || {};
    const tiebreakerEventKey = (ws.data() as any)?.tiebreakerEventKey || undefined;

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

    const ups = await getDocs(collection(wref, "userPicks"));
    const batch = writeBatch(db);
    ups.docs.forEach((ud) => {
      const data = ud.data() as any;
      const picks = (data.selections || {}) as Record<string, "home" | "away">;
      const tbPred = typeof data.tiebreaker === "number" ? data.tiebreaker : null;
      const score = computeUserWeekScore(picks, gamesList, { pointsPerCorrect: settings.pointsPerCorrect ?? 1 }, tiebreakerEventKey, tbPred);
      batch.set(doc(wref, "scores", ud.id), {
        correct: score.correct,
        points: score.points,
        tiebreakerPrediction: score.tiebreakerPrediction,
        tiebreakerActual: score.tiebreakerActual,
        tiebreakerAbsError: score.tiebreakerAbsError,
        updatedAt: serverTimestamp(),
      }, { merge: true });
    });
    await batch.commit();

    // Simple season leaderboard recompute
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

    setSaving(false);
    setMsg("Recomputed week and leaderboard.");
  }

  if (!leagueId) return <div className="p-6">Select or create a league first.</div>;

  return (
    <div className="p-6 max-w-xl space-y-4">
      <h1 className="text-2xl font-semibold">Scoring Settings</h1>
      {msg && <div className="text-emerald-700 text-sm">{msg}</div>}
      <div className="card space-y-2">
        <label className="text-sm">Points per correct pick</label>
        <input type="number" className="border rounded px-2 py-1 w-32" value={pointsPerCorrect} onChange={(e)=>setPointsPerCorrect(Number(e.target.value)||1)} />
        <div className="text-xs opacity-70">Tiebreaker: point differential (home - away) on the selected tiebreaker game.</div>
        <div className="flex gap-2">
          <button className="btn" disabled={saving} onClick={saveSettings}>{saving?"Saving…":"Save Settings"}</button>
        </div>
      </div>

      <div className="card space-y-2">
        <div className="font-medium">Recompute This Week</div>
        <div className="flex gap-2 items-center">
          <span className="text-sm">Week:</span>
          <input className="border rounded px-2 py-1 w-40" value={weekId} readOnly />
          <button className="btn" disabled={saving} onClick={recomputeWeek}>{saving?"Recomputing…":"Recompute Week"}</button>
        </div>
      </div>
    </div>
  );
}
