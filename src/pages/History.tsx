import { useEffect, useMemo, useState } from "react";
import { useLeague } from "../league/LeagueProvider";
import { useAuth } from "../auth/AuthProvider";
import { collection, doc, getDocs, onSnapshot, orderBy, query } from "firebase/firestore";
import { db } from "../lib/firebase";
import { formatWeekLabel } from "../lib/weeks";
import { isPickCorrect, type GameDoc } from "../lib/scoring";

type WeekDoc = { id: string; label?: string; locked?: boolean; final?: boolean; startTime?: string };
type Game = { eventKey: string; startTime: string; home: string; away: string } & Partial<GameDoc>;
type PicksDoc = { selections: Record<string, "home"|"away"> };

export default function History() {
  const { leagueId } = useLeague();
  const { user } = useAuth();
  const [weeks, setWeeks] = useState<WeekDoc[]>([]);
  const [gamesByWeek, setGamesByWeek] = useState<Record<string, Game[]>>({});
  const [picksByWeek, setPicksByWeek] = useState<Record<string, PicksDoc>>({});
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    if (!leagueId) return;
    (async () => {
      const q = query(collection(db, "leagues", leagueId, "weeks"), orderBy("startTime", "desc"));
      const snap = await getDocs(q);
      const arr: WeekDoc[] = snap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));
      setWeeks(arr);
    })();
  }, [leagueId]);

  useEffect(() => {
    if (!leagueId) return;
    const unsubs: (()=>void)[] = [];
    for (const w of weeks) {
      const ref = doc(db, "leagues", leagueId, "weeks", w.id);
      const unsub = onSnapshot(collection(ref, "games"), (snap) => {
        setGamesByWeek((m) => ({ ...m, [w.id]: snap.docs.map(d => ({ eventKey: d.id, ...d.data() } as any)) as Game[] }));
      });
      unsubs.push(unsub);
    }
    return () => unsubs.forEach(u=>u());
  }, [leagueId, weeks]);

  useEffect(() => {
    if (!leagueId || !user) return;
    const unsubs: (()=>void)[] = [];
    for (const w of weeks) {
      const ref = doc(db, "leagues", leagueId, "weeks", w.id, "userPicks", user.uid);
      const unsub = onSnapshot(ref, (snap) => {
        setPicksByWeek((m) => ({ ...m, [w.id]: (snap.data() as any) || { selections: {} } }));
      });
      unsubs.push(unsub);
    }
    return () => unsubs.forEach(u=>u());
  }, [leagueId, weeks, user]);

  const summaries = useMemo(() => {
    const s: Record<string, { correct:number; total:number }> = {};
    for (const w of weeks) {
      const games = gamesByWeek[w.id] || [];
      const picks = picksByWeek[w.id]?.selections || {};
      let correct = 0; let total = 0;
      for (const g of games) {
        const side = picks[g.eventKey] as ("home"|"away"|undefined);
        if (!side) continue;
        const v = isPickCorrect(side, g as any);
        if (v === "correct") correct++;
        if (v !== "pending") total++;
      }
      s[w.id] = { correct, total };
    }
    return s;
  }, [weeks, gamesByWeek, picksByWeek]);

  if (!leagueId) return <div className="p-6">Select or create a league.</div>;
  if (!user) return <div className="p-6">Please log in.</div>;

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold">History</h2>
      <div className="space-y-3">
        {weeks.map((w) => {
          const { correct, total } = summaries[w.id] || { correct:0, total:0 };
          const decided = (gamesByWeek[w.id] || []).filter(g => g.decided).length;
          return (
            <div key={w.id} className="card">
              <div className="flex items-center gap-3">
                <div className="flex-1">
                  <div className="font-medium">{w.label || formatWeekLabel(w.id as any)}</div>
                  <div className="text-xs opacity-70">{correct}/{total} decided • {decided} games final</div>
                </div>
                <button className="btn-light" onClick={()=>setExpanded(expanded===w.id?null:w.id)}>
                  {expanded === w.id ? "Hide" : "View"}
                </button>
              </div>
              {expanded === w.id && (
                <div className="mt-3 space-y-2">
                  {(gamesByWeek[w.id] || []).map((g) => {
                    const side = picksByWeek[w.id]?.selections?.[g.eventKey] as ("home"|"away"|undefined);
                    const v = isPickCorrect(side, g as any);
                    const label = side ? (side === "home" ? g.home : g.away) : "—";
                    return (
                      <div key={g.eventKey} className="flex items-center justify-between border-t pt-2">
                        <div>
                          <div className="text-sm font-medium">{g.away} @ {g.home}</div>
                          <div className="text-xs opacity-70">{new Date(g.startTime).toLocaleString()}</div>
                        </div>
                        <div className={`text-sm ${v==='correct'?'text-emerald-700':v==='incorrect'?'text-red-600':'opacity-70'}`}>{label}</div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
