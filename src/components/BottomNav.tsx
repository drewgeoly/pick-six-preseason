import { NavLink } from "react-router-dom";
import { useLeague } from "../league/LeagueProvider";
import { FALLBACK_WEEK_ID, readLastWeekId } from "../lib/weeks";

export default function BottomNav() {
  const { leagueId } = useLeague();
  const week = leagueId ? (readLastWeekId(leagueId) || FALLBACK_WEEK_ID) : FALLBACK_WEEK_ID;
  if (!leagueId) return null;

  const items = [
    { key: "home", label: "Home", to: `/l/${leagueId}/home/${week}` },
    { key: "compare", label: "Compare", to: `/l/${leagueId}/compare/${week}` },
    { key: "leaderboard", label: "Leaders", to: `/l/${leagueId}/leaderboard/${week}` },
    { key: "history", label: "History", to: `/l/${leagueId}/history` },
    { key: "profile", label: "Profile", to: `/profile` },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 md:hidden">
      <div className="mx-auto max-w-screen-sm">
        <ul className="m-3 rounded-2xl bg-white shadow-lg border flex justify-between px-2 py-1 text-xs">
          {items.map((it) => (
            <li key={it.key}>
              <NavLink
                to={it.to}
                className={({ isActive }) =>
                  `px-3 py-2 rounded-md block ${isActive ? "text-emerald-700 font-semibold" : "text-slate-600"}`
                }
              >
                {it.label}
              </NavLink>
            </li>
          ))}
        </ul>
      </div>
    </nav>
  );
}
