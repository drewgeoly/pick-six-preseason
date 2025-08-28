import { useEffect, useMemo, useState } from "react";
import { collection, doc, getDoc, getDocs, orderBy, query } from "firebase/firestore";
import { db } from "../lib/firebase";
import { useLeague } from "../league/LeagueProvider";
import { useNavigate, useParams } from "react-router-dom";
import { FALLBACK_WEEK_ID, formatWeekLabel, rememberLastWeekId } from "../lib/weeks";

type Score = { correct:number; matchPoints?:number };

export default function Leaderboard() {
  const { leagueId } = useLeague();
  const { weekId = FALLBACK_WEEK_ID } = useParams();
  const navigate = useNavigate();
  const [weekScores, setWeekScores] = useState<Record<string, Score>>({});
  const [profiles, setProfiles] = useState<Record<string, {displayName?:string|null; email?:string|null}>>({});
  const [season, setSeason] = useState<Record<string, {correct:number; matchPoints:number; weeksPlayed?:number; total?: number}>>({});
  const [memberUids, setMemberUids] = useState<string[]>([]);
  const [weeks, setWeeks] = useState<{ id: string; startTime?: string; label?: string }[]>([]);

  useEffect(() => {
    if (leagueId && weekId) rememberLastWeekId(leagueId, weekId);
  }, [leagueId, weekId]);

  useEffect(() => {
    if (!leagueId) return;
    (async () => {
      // Weeks list for chip selector
      try {
        const wq = query(collection(db, "leagues", leagueId, "weeks"), orderBy("startTime", "desc"));
        const ws = await getDocs(wq);
        setWeeks(ws.docs.map(d => ({ id: d.id, ...(d.data() as any) })));
      } catch {}

      // Members of this league
      const memSnap = await getDocs(collection(db, "leagues", leagueId, "members"));
      const members = memSnap.docs.map(d => d.id);
      setMemberUids(members);

      // Week scores for this league/week
      const wsSnap = await getDocs(collection(db, "leagues", leagueId, "weeks", weekId, "scores"));
      const ws: Record<string,Score> = {};
      wsSnap.forEach(d => ws[d.id] = d.data() as Score);
      setWeekScores(ws);

      // Season totals from aggregated leaderboard for this league
      type LbDoc = { strokeCorrect?: number; strokeTotal?: number; totalCorrect?: number; correct?: number; totalPoints?: number; matchPoints?: number; weeksPlayed?: number };
      const seasonMap: Record<string, {correct:number; matchPoints:number; weeksPlayed?:number; total?: number}> = {};
      try {
        const lbSnap = await getDocs(collection(doc(db, "leagues", leagueId), "leaderboard", "current", "users"));
        lbSnap.forEach(d => {
          const data = d.data() as LbDoc;
          seasonMap[d.id] = {
            correct: Number(data?.strokeCorrect ?? data?.totalCorrect ?? data?.correct ?? 0),
            matchPoints: Number(data?.totalPoints ?? data?.matchPoints ?? 0),
            weeksPlayed: Number(data?.weeksPlayed ?? 0),
            total: Number(data?.strokeTotal ?? 0),
          };
        });
      } catch (err) {
        // If rules block this collection, continue rendering without season data
        console.warn("Could not load aggregated leaderboard; continuing without season totals.", err);
      }
      setSeason(seasonMap);

      // Load display names for all known users (members ∪ any with scores)
      const uids = Array.from(new Set([...members, ...Object.keys(ws), ...Object.keys(seasonMap)]));
      const profEntries = await Promise.all(uids.map(async (uid) => {
        try {
          const u = await getDoc(doc(db, "users", uid));
          const ud = (u.data() as { displayName?: string; email?: string } | undefined) || {};
          // precedence matches Members page: users.displayName -> users.email -> uid (handled at render)
          const displayName = ud.displayName || ud.email || null;
          const email = ud.email || null;
          return [uid, { displayName, email }] as const;
        } catch {
          return [uid, { displayName: null, email: null }] as const;
        }
      }));
      setProfiles(Object.fromEntries(profEntries));
    })();
  }, [leagueId, weekId]);

  const weekTable = useMemo(() =>
    memberUids
      .map((uid) => ({
        uid,
        name: profiles[uid]?.displayName || profiles[uid]?.email || uid,
        correct: weekScores[uid]?.correct ?? 0,
        matchPoints: weekScores[uid]?.matchPoints ?? 0,
      }))
      .sort((a,b) => b.correct - a.correct || (b.matchPoints??0) - (a.matchPoints??0))
  , [memberUids, weekScores, profiles]);

  const seasonTable = useMemo(() =>
    memberUids
      .map((uid) => {
        const s = season[uid] || { correct: 0, matchPoints: 0, weeksPlayed: 0, total: 0 };
        return {
          uid,
          name: profiles[uid]?.displayName || profiles[uid]?.email || uid,
          correct: s.correct,
          matchPoints: s.matchPoints,
          accuracy: s.total ? (s.correct / s.total) : 0,
        };
      })
      .sort((a,b) => b.correct - a.correct || b.matchPoints - a.matchPoints || b.accuracy - a.accuracy)
  , [memberUids, season, profiles]);

  if (!leagueId) {
    return <div className="p-6">Select a league to view the leaderboard.</div>;
  }
  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <section className="card">
        <div className="flex items-center justify-between mb-2 gap-3">
          <h2 className="text-xl font-semibold">{formatWeekLabel(weekId)} — Leaderboard</h2>
        </div>
        {weeks.length > 0 && (
          <div className="mb-3 overflow-x-auto no-scrollbar -mx-1 px-1">
            <div className="flex gap-2 min-w-max">
              {weeks.map(w => (
                <button
                  key={w.id}
                  onClick={() => navigate(`/leaderboard/${w.id}`)}
                  className={`badge ${w.id===weekId ? 'btn' : 'btn-light'}`}
                  aria-pressed={w.id===weekId}
                >
                  {w.label || formatWeekLabel(w.id)}
                </button>
              ))}
            </div>
          </div>
        )}
        <table className="w-full text-sm">
          <thead><tr><th className="text-left py-2">Player</th><th>Correct</th><th>Match Pts</th></tr></thead>
          <tbody>
            {weekTable.map(r => (
              <tr key={r.uid} className="border-t">
                <td className="py-2">{r.name}</td>
                <td className="text-center">{r.correct}</td>
                <td className="text-center">{r.matchPoints ?? 0}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {seasonTable.length > 0 ? (
        <section className="card">
          <h2 className="text-xl font-semibold mb-2">Season Standings</h2>
          <table className="w-full text-sm">
            <thead><tr><th className="text-left py-2">Player</th><th>Total Correct</th><th>Match Pts</th><th>Accuracy</th></tr></thead>
            <tbody>
              {seasonTable.map(r => (
                <tr key={r.uid} className="border-t">
                  <td className="py-2">{r.name}</td>
                  <td className="text-center">{r.correct}</td>
                  <td className="text-center">{r.matchPoints}</td>
                  <td className="text-center">{(r.accuracy*100).toFixed(1)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : (
        <section className="card">
          <h2 className="text-xl font-semibold mb-2">Season Standings</h2>
          <div className="text-sm text-slate-600">
            Season totals are not available for this league yet. If you are an admin, enable read access for members to
            <code className="ml-1">/leagues/{leagueId}/leaderboard/current/users</code> in Firestore rules, or we can compute a local summary later.
          </div>
        </section>
      )}
    </div>
  );
}
