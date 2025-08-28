import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "./AuthProvider";
import { useLeague } from "../league/LeagueProvider";
import { FALLBACK_WEEK_ID, readLastWeekId } from "../lib/weeks";

export function RequireAuth({ fallback = "/login" }: { fallback?: string }) {
  const { user, loading } = useAuth();
  if (loading) return null; // or a spinner
  if (!user) return <Navigate to={fallback} replace />;
  return <Outlet />;
}

export function RedirectIfAuth({ to }: { to?: string }) {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (!user) return <Outlet />;
  // If they are logged in, go to last league, else to create league
  const lastLeague = localStorage.getItem("lastLeagueId");
  const week = lastLeague ? (readLastWeekId(lastLeague) || FALLBACK_WEEK_ID) : null;
  const target = to || (lastLeague ? `/l/${lastLeague}/leaderboard/${week}` : "/leagues/create");
  return <Navigate to={target} replace />;
}

export function RequireLeagueMember({ fallback = "/leagues/join" }: { fallback?: string }){
  const { loading, role } = useLeague();
  if (loading) return null;
  if (role === "none") return <Navigate to={fallback} replace />;
  return <Outlet />;
}
