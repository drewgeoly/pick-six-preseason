import { useEffect, useMemo, useState } from "react";
import { db } from "../lib/firebase";
import { collection, doc, getDoc, onSnapshot } from "firebase/firestore";
import { useLeague } from "../league/LeagueProvider";
import { isPickCorrect, type PickVerdict, type GameDoc } from "../lib/scoring";
import { useParams } from "react-router-dom";

type Game = { eventKey: string; name: string; startTime: string; home: string; away: string } & Partial<GameDoc>;
type PicksDoc = { selections: Record<string, "home"|"away">; tiebreaker?: number };

export default function ComparePicks() {
  const { leagueId } = useLeague();
  const { weekId = "2025-W01" } = useParams();
  const [games, setGames] = useState<Game[]>([]);
  const [picks, setPicks] = useState<Record<string, PicksDoc>>({}); // uid -> doc
  const [users, setUsers] = useState<Record<string, {displayName:string}>>({});
  const [locked, setLocked] = useState(false);

  useEffect(() => {
    if (!leagueId) return;
    const weekRef = doc(db, "leagues", leagueId, "weeks", weekId);
    (async () => {
      const weekSnap = await getDoc(weekRef);
      setLocked(Boolean(weekSnap.data()?.locked));
    })();
    const unsub = onSnapshot(collection(weekRef, "games"), (snap) => {
      setGames(snap.docs.map(d => ({ eventKey: d.id, ...d.data() } as any)));
    });
    return () => unsub();
  }, [leagueId, weekId]);

  useEffect(() => {
    if (!leagueId) return;
    const unsub = onSnapshot(collection(db, "leagues", leagueId, "weeks", weekId, "userPicks"), (snap) => {
      const obj: Record<string,PicksDoc> = {};
      snap.forEach(d => obj[d.id] = d.data() as PicksDoc);
      setPicks(obj);
    });
    return () => unsub();
  }, [leagueId, weekId]);

  // load display names for table headings
  useEffect(() => {
    (async () => {
      const uids = Object.keys(picks);
      const entries = await Promise.all(uids.map(async (uid) => {
        const snap = await getDoc(doc(db, "users", uid));
        return [uid, { displayName: snap.data()?.displayName || "Player" }];
      }));
      setUsers(Object.fromEntries(entries));
    })();
  }, [picks]);

  function verdictClass(v: PickVerdict, selected: boolean) {
    if (!selected) return "";
    if (v === "correct") return "ring-2 ring-emerald-600 bg-emerald-50";
    if (v === "incorrect") return "ring-2 ring-red-600 bg-red-50";
    if (v === "tie") return "ring-2 ring-gray-500 bg-gray-50";
    return "";
  }

  const consensus = useMemo(() => {
    // eventKey -> {home:#, away:#, total:#}
    const map: Record<string, {home:number; away:number; total:number}> = {};
    for (const p of Object.values(picks)) {
      for (const [ek, side] of Object.entries(p.selections || {})) {
        if (!map[ek]) map[ek] = {home:0, away:0, total:0};
        map[ek][side]++; map[ek].total++;
      }
    }
    return map;
  }, [picks]);

  if (!leagueId) {
    return <div className="p-6">Select a league to view picks.</div>;
  }
  if (!locked) {
    return <div className="p-6">Picks are hidden until lock. Check back after the deadline.</div>;
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <h1 className="text-2xl font-semibold mb-4">Compare Picks — {weekId}</h1>

      <div className="space-y-4">
        {games.map(g => {
          const c = consensus[g.eventKey] || {home:0,away:0,total:0};
          const hp = c.total ? Math.round(100*c.home/c.total) : 0;
          const ap = c.total ? Math.round(100*c.away/c.total) : 0;
          return (
            <div key={g.eventKey} className="card">
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-medium">{g.name}</div>
                  <div className="text-sm text-gray-600">{new Date(g.startTime).toLocaleString()}</div>
                  {g.decided && (
                    <div className="text-xs mt-1">Final: {g.finalScoreHome ?? ""}–{g.finalScoreAway ?? ""}</div>
                  )}
                </div>
                <div className="text-sm">
                  Consensus: <b>{g.home}</b> {hp}% · <b>{g.away}</b> {ap}%
                </div>
              </div>

              <div className="overflow-x-auto mt-3">
                <table className="text-sm w-full">
                  <thead>
                    <tr>
                      <th className="text-left py-2">Player</th>
                      <th className="text-left">Pick</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(picks).map(([uid, p]) => {
                      const side = p.selections?.[g.eventKey] as ("home"|"away"|undefined);
                      const v = isPickCorrect(side, g);
                      const label = side ? (side === "home" ? g.home : g.away) : "—";
                      return (
                        <tr key={uid} className="border-t">
                          <td className="py-2">{users[uid]?.displayName || uid}</td>
                          <td className={verdictClass(v, !!side)}>{label}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
