import { Link, useParams } from "react-router-dom";
import CoachTip from "../components/CoachTip";
import { useOnboarding } from "../store/onboarding";
import { useLeague } from "../league/LeagueProvider";
import { FALLBACK_WEEK_ID, readLastWeekId } from "../lib/weeks";

export default function Onboarding() {
  const { leagueId } = useLeague();
  const { weekId = (leagueId ? (readLastWeekId(leagueId) || FALLBACK_WEEK_ID) : FALLBACK_WEEK_ID) } = useParams();
  const { step, next, back, completed, reset } = useOnboarding();

  if (!leagueId) return <div className="p-6">Select or create a league.</div>;

  const steps = [
    {
      title: "Welcome to Pick‑Six",
      body: (
        <p>
          Each week, make six picks before the deadline. Earn points for correct picks and compete with your league.
        </p>
      ),
    },
    {
      title: "Deadlines & Lock",
      body: (
        <p>
          Picks lock at kickoff. You can edit freely until then. After lock, compare your picks with friends.
        </p>
      ),
    },
    {
      title: "Scoring & Tiebreaker",
      body: (
        <p>
          Correct picks earn points. A tiebreaker (e.g., total points) settles ties. Transparency first.
        </p>
      ),
    },
    {
      title: "Try a Practice Pick",
      body: (
        <p>
          Head to this week’s matchups and try selecting a team. You’ll see your pick save instantly.
        </p>
      ),
      action: (
        <Link className="btn" to={`/l/${leagueId}/picks/${weekId}`}>Go to Picks</Link>
      ),
    },
    {
      title: "Finish Setup",
      body: (
        <p>
          Add a display name and avatar so friends can recognize you on the leaderboard.
        </p>
      ),
      action: (
        <Link className="btn" to={`/profile`}>Edit Profile</Link>
      ),
    },
  ];

  const s = steps[step] ?? steps[0];

  return (
    <div className="space-y-4">
      <header className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Onboarding</h2>
        <div className="text-sm text-slate-500">Step {step + 1} of {steps.length}</div>
      </header>

      <CoachTip title={s.title} action={s.action}>{s.body}</CoachTip>

      <div className="flex justify-between">
        <button className="btn-secondary" onClick={back} disabled={step === 0}>Back</button>
        {step < steps.length - 1 && (
          <button className="btn" onClick={next}>Next</button>
        )}
        {step === steps.length - 1 && (
          <Link className="btn" to={`/l/${leagueId}/home/${weekId}`} onClick={next}>Finish</Link>
        )}
      </div>

      {completed && (
        <div className="text-sm text-emerald-700">All done! You can revisit onboarding anytime. <button className="underline" onClick={reset}>Restart</button></div>
      )}
    </div>
  );
}
