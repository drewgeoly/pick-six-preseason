import { Link, NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";
import { useLeague } from "../league/LeagueProvider";
import LeagueSwitcher from "./LeagueSwitcher";
import { auth } from "../lib/firebase";
import { FALLBACK_WEEK_ID, readLastWeekId } from "../lib/weeks";
import BottomNav from "./BottomNav";

// inside component:

export default function AppLayout() {
  const { user } = useAuth();
  const { leagueId, role, code } = useLeague();
  const nav = useNavigate();

  return (
    <div className="min-h-screen bg-surface">
      <header className="app-header sticky top-0 z-40">
        <div className="container mx-auto px-4 py-3 flex flex-wrap items-center gap-3">
          {/* Left: brand + primary actions */}
          <div className="flex items-center gap-4">
            <Link
              to="/"
              onClick={(e) => {
                e.preventDefault();
                if (!user) { nav("/login"); return; }
                const last = localStorage.getItem("lastLeagueId");
                if (last) {
                  const week = readLastWeekId(last) || FALLBACK_WEEK_ID;
                  nav(`/l/${last}/home/${week}`);
                } else {
                  nav("/leagues/create");
                }
              }}
              className="brand text-white"
            >Pick Six</Link>
            <Link className="header-link" to="/leagues/create">Create League</Link>
            <Link className="header-link" to="/leagues/join">Join League</Link>
          </div>

          {/* Middle: league switcher */}
          <div className="flex-1 flex justify-center">
            <LeagueSwitcher />
          </div>

          {/* Right: auth/profile */}
          <div className="ml-auto flex items-center gap-3">
            {user ? (
              <>
                <Link to="/profile" className="header-link">My Profile</Link>
                <button className="btn" onClick={() => auth.signOut()}>Log out</button>
              </>
            ) : (
              <>
                <Link to="/login" className="header-link">Log in</Link>
                <Link to="/signup" className="header-link">Sign up</Link>
              </>
            )}
          </div>
        </div>
      </header>

      <main className="container mx-auto p-4 with-bottom-nav">
        {leagueId ? (
          <div className="grid grid-cols-12 gap-4">
            {/* Sidebar */}
            <aside className="col-span-12 md:col-span-3 lg:col-span-2">
              <div className="card sticky top-16">
                <nav className="flex flex-col gap-1 text-sm">
                  {(() => { const week = readLastWeekId(leagueId!) || FALLBACK_WEEK_ID; return (
                    <>
                      <NavLink to={`/l/${leagueId}/home/${week}`} className={({isActive})=>`side-link ${isActive ? 'side-link-active' : ''}`}>Home</NavLink>
                      <NavLink to={`/l/${leagueId}/leaderboard/${week}`} className={({isActive})=>`side-link ${isActive ? 'side-link-active' : ''}`}>Leaderboard</NavLink>
                      <NavLink to={`/l/${leagueId}/picks/${week}`} className={({isActive})=>`side-link ${isActive ? 'side-link-active' : ''}`}>My Picks</NavLink>
                      <NavLink to={`/l/${leagueId}/compare/${week}`} className={({isActive})=>`side-link ${isActive ? 'side-link-active' : ''}`}>Compare</NavLink>
                      <NavLink to={`/l/${leagueId}/consensus/${week}`} className={({isActive})=>`side-link ${isActive ? 'side-link-active' : ''}`}>Consensus</NavLink>
                      <NavLink to={`/l/${leagueId}/members`} className={({isActive})=>`side-link ${isActive ? 'side-link-active' : ''}`}>Members</NavLink>
                      <NavLink to={`/l/${leagueId}/history`} className={({isActive})=>`side-link ${isActive ? 'side-link-active' : ''}`}>History</NavLink>
                      {(role === "owner" || role === "admin") && (
                        <NavLink to={`/l/${leagueId}/admin/select-games/${week}`} className={({isActive})=>`side-link ${isActive ? 'side-link-active' : ''}`}>Admin</NavLink>
                      )}
                    </>
                  ); })()}
                </nav>
                {code && (
                  <div className="mt-3 flex items-center gap-2">
                    <span className="badge-light">Code: <strong className="ml-1 tracking-wider">{code}</strong></span>
                    <button className="btn btn-light" onClick={() => navigator.clipboard.writeText(code)} title="Copy league code">Copy</button>
                  </div>
                )}
              </div>
            </aside>

            {/* Content */}
            <section className="col-span-12 md:col-span-9 lg:col-span-10">
              <Outlet />
            </section>
          </div>
        ) : (
          <Outlet />
        )}
      </main>

      {/* Mobile FAB for Make Picks */}
      {leagueId && (
        <Link
          to={`/l/${leagueId}/picks/${readLastWeekId(leagueId) || FALLBACK_WEEK_ID}`}
          className="fab"
          aria-label="Make Picks"
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
            <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
          <span className="sr-only">Make Picks</span>
        </Link>
      )}

      {/* Mobile Bottom Navigation */}
      <BottomNav />
    </div>
  );
}
