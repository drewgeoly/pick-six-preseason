  import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { collection, doc, getDocs } from "firebase/firestore";
import { db } from "../lib/firebase";
import { useLeague } from "../league/LeagueProvider";
import { FALLBACK_WEEK_ID, formatWeekLabel, rememberLastWeekId } from "../lib/weeks";

/**
 * Consensus picks for a given league + week.
 * Reads user picks at leagues/{leagueId}/weeks/{weekId}/userPicks
 * and game listing at leagues/{leagueId}/weeks/{weekId}/games
 */
export default function Consensus() {
  const { leagueId } = useLeague();
  const { weekId = FALLBACK_WEEK_ID } = useParams();

  useEffect(() => {
    if (leagueId && weekId) rememberLastWeekId(leagueId, weekId);
  }, [leagueId, weekId]);

  type Game = {
    eventKey: string;
    name: string;
    home?: string;
    away?: string;
    startTime?: string;
  };

  const [games, setGames] = useState<Game[]>([]);
  const [picksByUser, setPicksByUser] = useState<Record<string, Record<string, "home"|"away">>>({});

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!leagueId || !weekId) return;
      const wref = doc(db, "leagues", leagueId, "weeks", weekId);

      // Load games
      const gs = await getDocs(collection(wref, "games"));
      const gList: Game[] = gs.docs.map(d => {
        const data = d.data() as any;
        return {
          eventKey: d.id,
          name: data.name,
          home: data.home,
          away: data.away,
          startTime: data.startTime,
        };
      });

      // Load user picks
      const ups = await getDocs(collection(wref, "userPicks"));
      const pu: Record<string, Record<string, "home"|"away">> = {};
      ups.forEach(d => {
        const data = d.data() as any;
        const sel = (data.selections || {}) as Record<string, "home"|"away">;
        pu[d.id] = sel;
      });

      if (!cancelled) {
        setGames(gList.sort((a,b)=>+new Date(a.startTime||0)-+new Date(b.startTime||0)));
        setPicksByUser(pu);
      }
    })();
    return () => { cancelled = true; };
  }, [leagueId, weekId]);

  const consensus = useMemo(() => {
    const rows = games.map(g => {
      let home = 0, away = 0;
      for (const sel of Object.values(picksByUser)) {
        const c = sel[g.eventKey];
        if (c === "home") home += 1;
        if (c === "away") away += 1;
      }
      const total = home + away;
      const hp = total ? Math.round((home/total)*100) : 0;
      const ap = total ? Math.round((away/total)*100) : 0;
      return { ...g, homeCount: home, awayCount: away, total, homePct: hp, awayPct: ap };
    });
    return rows;
  }, [games, picksByUser]);

  if (!leagueId) return <div className="p-6">Select or create a league first.</div>;

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-baseline gap-3">
        <h1 className="text-2xl font-semibold mr-auto">Consensus — {formatWeekLabel(weekId)}</h1>
        <div className="text-sm opacity-70">Ballots: {Object.keys(picksByUser).length}</div>
      </div>

      <div className="card">
        <table className="w-full text-sm">
          <thead>
            <tr>
              <th className="text-left py-2">Game</th>
              <th>Home</th>
              <th>Away</th>
              <th>Total</th>
            </tr>
          </thead>
          <tbody>
            {consensus.map(r => (
              <tr key={r.eventKey} className="border-t">
                <td className="py-2">
                  <div className="font-medium">{r.name}</div>
                  <div className="text-xs opacity-70">{r.startTime ? new Date(r.startTime).toLocaleString() : ""}</div>
                </td>
                <td className="text-center">
                  <div className="font-medium">{r.homeCount}</div>
                  <div className="text-xs opacity-70">{r.homePct}%</div>
                </td>
                <td className="text-center">
                  <div className="font-medium">{r.awayCount}</div>
                  <div className="text-xs opacity-70">{r.awayPct}%</div>
                </td>
                <td className="text-center">
                  <div className="font-medium">{r.total}</div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
