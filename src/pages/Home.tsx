import { Link, useParams } from "react-router-dom";
import CoachTip from "../components/CoachTip";
import { useLeague } from "../league/LeagueProvider";
import { FALLBACK_WEEK_ID, formatWeekLabel, readLastWeekId } from "../lib/weeks";

export default function Home() {
  const { leagueId } = useLeague();
  const { weekId = (leagueId ? (readLastWeekId(leagueId) || FALLBACK_WEEK_ID) : FALLBACK_WEEK_ID) } = useParams();
  if (!leagueId) return <div className="p-6">Select or create a league.</div>;

  return (
    <div className="space-y-4">
      <header className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">This Week — {formatWeekLabel(weekId!)}</h2>
        <div className="badge-light">Countdown: soon</div>
      </header>

      <CoachTip
        title="New here? Start with a quick tour"
        action={<Link className="btn" to={`/l/${leagueId}/onboarding/${weekId}`}>Start</Link>}
      >
        Get the basics in under a minute: deadlines, scoring, and a practice pick.
      </CoachTip>

      <div className="card">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm text-slate-600">Progress</div>
            <div className="font-semibold">Make your 6 picks</div>
          </div>
          <Link to={`/l/${leagueId}/picks/${weekId}`} className="btn">Make Picks</Link>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <div className="card">
          <div className="font-medium mb-1">Coach Tips</div>
          <div className="text-sm text-slate-600">Guided onboarding and hints coming soon.</div>
        </div>
        <div className="card">
          <div className="font-medium mb-1">This Week's Games</div>
          <div className="text-sm text-slate-600">Game cards will appear here.</div>
        </div>
      </div>
    </div>
  );
}
