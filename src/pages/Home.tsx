import { Link, useNavigate, useParams } from "react-router-dom";
import CoachTip from "../components/CoachTip";
import { useLeague } from "../league/LeagueProvider";
import { FALLBACK_WEEK_ID, formatWeekLabel, readLastWeekId } from "../lib/weeks";
import { collection, doc, onSnapshot } from "firebase/firestore";
import { db } from "../lib/firebase";
import { useEffect, useMemo, useState } from "react";

export default function Home() {
  const { leagueId } = useLeague();
  const { weekId: weekIdParam = (leagueId ? (readLastWeekId(leagueId) || FALLBACK_WEEK_ID) : FALLBACK_WEEK_ID) } = useParams();
  const [currentWeekId, setCurrentWeekId] = useState<string | null>(null);
  const navigate = useNavigate();
  const [games, setGames] = useState<Array<{ eventKey: string; startTime: string; home?: string; away?: string }>>([]);
  const [tipActive, setTipActive] = useState(false);
  if (!leagueId) return <div className="p-6">Select or create a league.</div>;

  // Subscribe to league to get currentWeekId
  useEffect(() => {
    if (!leagueId) return;
    const lref = doc(db, "leagues", leagueId);
    const unsub = onSnapshot(lref, (snap) => {
      const data = snap.data() as any;
      setCurrentWeekId(typeof data?.currentWeekId === "string" ? data.currentWeekId : null);
    });
    return () => unsub();
  }, [leagueId]);

  const resolvedWeekId = currentWeekId || weekIdParam;

  useEffect(() => {
    if (!leagueId || !resolvedWeekId) return;
    const wref = doc(db, "leagues", leagueId, "weeks", resolvedWeekId);
    const unsub = onSnapshot(collection(wref, "games"), (snap) => {
      const list = snap.docs.map(d => ({ eventKey: d.id, ...(d.data() as any) }))
        .sort((a, b) => +new Date(a.startTime) - +new Date(b.startTime));
      setGames(list);
    });
    return () => unsub();
  }, [leagueId, resolvedWeekId]);

  const nextKick = useMemo(() => {
    if (!games.length) return null;
    const t = new Date(games[0].startTime);
    return t;
  }, [games]);

  return (
    <div className="space-y-4">
      <header className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">This Week — {formatWeekLabel(resolvedWeekId!)}</h2>
        <div className="badge-light">
          {nextKick ? `First kickoff: ${nextKick.toLocaleString()}` : "Kickoff: TBA"}
        </div>
      </header>

      <div className={`${tipActive ? "scale-[1.02] ring-2 ring-emerald-400 shadow-lg" : ""} transition-transform duration-200`}>
        <CoachTip
          title="New here? Start with a quick tour"
          action={
            <button
              className="btn"
              onMouseDown={() => setTipActive(true)}
              onMouseUp={() => setTipActive(false)}
              onMouseLeave={() => setTipActive(false)}
              onClick={(e) => {
                e.preventDefault();
                setTipActive(true);
                // brief emphasis before navigating
                setTimeout(() => navigate(`/l/${leagueId}/onboarding/${resolvedWeekId}`), 150);
              }}
            >
              Start
            </button>
          }
        >
          Get the basics in under a minute: deadlines, scoring, and a practice pick.
        </CoachTip>
      </div>

      <div className="card">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm text-slate-600">Progress</div>
            <div className="font-semibold">Make your 6 picks</div>
          </div>
          <Link to={`/l/${leagueId}/picks/${resolvedWeekId}`} className="btn">Make Picks</Link>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <div className="card">
          <div className="font-medium mb-1">Coach Tips</div>
          <div className="text-sm text-slate-600">Guided onboarding and hints coming soon.</div>
        </div>
        <div className="card">
          <div className="font-medium mb-1">This Week's Games</div>
          {games.length === 0 ? (
            <div className="text-sm text-slate-600">Waiting for the admin to select this week's games.</div>
          ) : (
            <div className="divide-y">
              {games.map(g => (
                <div key={g.eventKey} className="py-2 flex items-center justify-between">
                  <div className="text-sm font-medium">{g.away || "Away"} @ {g.home || "Home"}</div>
                  <div className="text-xs opacity-60">{new Date(g.startTime).toLocaleString()}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
