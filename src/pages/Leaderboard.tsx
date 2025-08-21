import { useEffect, useMemo, useState } from "react";
import { collection, doc, getDoc, getDocs } from "firebase/firestore";
import { db } from "../lib/firebase";
import { useLeague } from "../league/LeagueProvider";
import { useParams } from "react-router-dom";

type Score = { correct:number; matchPoints?:number };

export default function Leaderboard() {
  const { leagueId } = useLeague();
  const { weekId = "2025-W01" } = useParams();
  const [weekScores, setWeekScores] = useState<Record<string, Score>>({});
  const [profiles, setProfiles] = useState<Record<string, {displayName?:string|null; email?:string|null}>>({});
  const [season, setSeason] = useState<Record<string, {correct:number; matchPoints:number; weeksPlayed?:number}>>({});
  const [memberUids, setMemberUids] = useState<string[]>([]);

  useEffect(() => {
    if (!leagueId) return;
    (async () => {
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
      const lbSnap = await getDocs(collection(doc(db, "leagues", leagueId), "leaderboard", "current", "users"));
      const seasonMap: Record<string, {correct:number; matchPoints:number; weeksPlayed?:number}> = {};
      lbSnap.forEach(d => {
        const data = d.data() as any;
        seasonMap[d.id] = {
          correct: Number(data.totalCorrect ?? data.correct ?? 0),
          matchPoints: Number(data.totalPoints ?? data.matchPoints ?? 0),
          weeksPlayed: Number(data.weeksPlayed ?? 0),
        };
      });
      setSeason(seasonMap);

      // Load display names for all known users (members ∪ any with scores)
      const uids = Array.from(new Set([...members, ...Object.keys(ws), ...Object.keys(seasonMap)]));
      const profEntries = await Promise.all(uids.map(async (uid) => {
        try {
          const [u, m] = await Promise.all([
            getDoc(doc(db, "users", uid)),
            getDoc(doc(db, "leagues", leagueId!, "members", uid)),
          ]);
          const ud = (u.data() as any) || {};
          const md = (m.data() as any) || {};
          // precedence: users.displayName -> members.displayName -> users.email -> members.email -> null
          const displayName = ud.displayName || md.displayName || ud.email || md.email || null;
          const email = ud.email || md.email || null;
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
        const s = season[uid] || { correct: 0, matchPoints: 0, weeksPlayed: 0 };
        return {
          uid,
          name: profiles[uid]?.displayName || profiles[uid]?.email || uid,
          correct: s.correct,
          matchPoints: s.matchPoints,
          accuracy: s.weeksPlayed ? (s.correct / (s.weeksPlayed * 6)) : 0,
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
        <h2 className="text-xl font-semibold mb-2">Week {weekId} Leaderboard</h2>
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
    </div>
  );
}
