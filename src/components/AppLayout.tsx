import { Link, NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";
import { useLeague } from "../league/LeagueProvider";
import LeagueSwitcher from "./LeagueSwitcher";
import { auth, db } from "../lib/firebase";
import { collection, getDocs, limit, orderBy, query } from "firebase/firestore";

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
              onClick={async (e) => {
                e.preventDefault();
                if (!user) { nav("/login"); return; }
                const last = localStorage.getItem("lastLeagueId");
                if (last) { nav(`/l/${last}/leaderboard/2025-W01`); return; }
                try {
                  const q = query(collection(db, "users", user.uid, "leagues"), orderBy("joinedAt", "desc"), limit(1));
                  const snap = await getDocs(q);
                  if (!snap.empty) {
                    const id = snap.docs[0].id;
                    localStorage.setItem("lastLeagueId", id);
                    nav(`/l/${id}/leaderboard/2025-W01`);
                  } else {
                    nav("/leagues/start");
                  }
                } catch {
                  nav("/leagues/start");
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
            {code && (
              <span className="hidden md:inline-flex badge">Code: <strong className="ml-1 tracking-wider">{code}</strong></span>
            )}
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

      <main className="container mx-auto p-4 pb-24">
        {leagueId ? (
          <div className="grid grid-cols-12 gap-4">
            {/* Sidebar */}
            <aside className="hidden md:block md:col-span-3 lg:col-span-2">
              <div className="card sticky top-16">
                <nav className="flex flex-col gap-1 text-sm">
                  <NavLink to={`/l/${leagueId}/leaderboard/2025-W01`} className={({isActive})=>`side-link ${isActive ? 'side-link-active' : ''}`}>Leaderboard</NavLink>
                  <NavLink to={`/l/${leagueId}/picks/2025-W01`} className={({isActive})=>`side-link ${isActive ? 'side-link-active' : ''}`}>My Picks</NavLink>
                  <NavLink to={`/l/${leagueId}/compare/2025-W01`} className={({isActive})=>`side-link ${isActive ? 'side-link-active' : ''}`}>Compare</NavLink>
                  <NavLink to={`/l/${leagueId}/consensus/2025-W01`} className={({isActive})=>`side-link ${isActive ? 'side-link-active' : ''}`}>Consensus</NavLink>
                  <NavLink to={`/l/${leagueId}/members`} className={({isActive})=>`side-link ${isActive ? 'side-link-active' : ''}`}>Members</NavLink>
                  {(role === "owner" || role === "admin") && (
                    <NavLink to={`/l/${leagueId}/admin/select-games/2025-W01`} className={({isActive})=>`side-link ${isActive ? 'side-link-active' : ''}`}>Admin</NavLink>
                  )}
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

      {/* Mobile bottom tab bar */}
      {leagueId && (
        <nav className="md:hidden fixed bottom-0 inset-x-0 bg-white border-t shadow-lg z-40">
          <div className="grid grid-cols-5 text-xs">
            <NavLink to={`/l/${leagueId}/leaderboard/2025-W01`} className={({isActive})=>`flex flex-col items-center justify-center py-2 ${isActive ? 'text-emerald-700 font-semibold' : 'text-slate-600'}`}>Leaderboard</NavLink>
            <NavLink to={`/l/${leagueId}/picks/2025-W01`} className={({isActive})=>`flex flex-col items-center justify-center py-2 ${isActive ? 'text-emerald-700 font-semibold' : 'text-slate-600'}`}>Picks</NavLink>
            <NavLink to={`/l/${leagueId}/compare/2025-W01`} className={({isActive})=>`flex flex-col items-center justify-center py-2 ${isActive ? 'text-emerald-700 font-semibold' : 'text-slate-600'}`}>Compare</NavLink>
            <NavLink to={`/l/${leagueId}/members`} className={({isActive})=>`flex flex-col items-center justify-center py-2 ${isActive ? 'text-emerald-700 font-semibold' : 'text-slate-600'}`}>Members</NavLink>
            {(role === 'owner' || role === 'admin') ? (
              <NavLink to={`/l/${leagueId}/admin/select-games/2025-W01`} className={({isActive})=>`flex flex-col items-center justify-center py-2 ${isActive ? 'text-emerald-700 font-semibold' : 'text-slate-600'}`}>Admin</NavLink>
            ) : (
              <span className="flex flex-col items-center justify-center py-2 text-slate-300">Admin</span>
            )}
          </div>
        </nav>
      )}
    </div>
  );
}
