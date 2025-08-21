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
    <div className="p-4 sm:p-6 max-w-5xl mx-auto space-y-6">
      <section className="card">
        <h2 className="text-lg sm:text-xl font-semibold mb-2">Week {weekId} Leaderboard</h2>
        <div className="overflow-x-auto -mx-2 sm:mx-0">
          <table className="min-w-full table-fixed text-xs sm:text-sm">
            <thead>
              <tr className="whitespace-nowrap">
                <th className="text-left py-2 w-1/2 sm:w-2/3 px-2">Player</th>
                <th className="px-2">Correct</th>
                <th className="px-2">Match Pts</th>
              </tr>
            </thead>
            <tbody>
              {weekTable.map(r => (
                <tr key={r.uid} className="border-t">
                  <td className="py-2 px-2">
                    <div className="truncate max-w-[180px] sm:max-w-[260px]">{r.name}</div>
                  </td>
                  <td className="text-center px-2">{r.correct}</td>
                  <td className="text-center px-2">{r.matchPoints ?? 0}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card">
        <h2 className="text-lg sm:text-xl font-semibold mb-2">Season Standings</h2>
        <div className="overflow-x-auto -mx-2 sm:mx-0">
          <table className="min-w-full table-fixed text-xs sm:text-sm">
            <thead>
              <tr className="whitespace-nowrap">
                <th className="text-left py-2 w-1/2 sm:w-2/3 px-2">Player</th>
                <th className="px-2">Total Correct</th>
                <th className="px-2">Match Pts</th>
                <th className="px-2">Accuracy</th>
              </tr>
            </thead>
            <tbody>
              {seasonTable.map(r => (
                <tr key={r.uid} className="border-t">
                  <td className="py-2 px-2">
                    <div className="truncate max-w-[180px] sm:max-w-[260px]">{r.name}</div>
                  </td>
                  <td className="text-center px-2">{r.correct}</td>
                  <td className="text-center px-2">{r.matchPoints}</td>
                  <td className="text-center px-2">{(r.accuracy*100).toFixed(1)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
