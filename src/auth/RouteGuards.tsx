import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "./AuthProvider";
import { useLeague } from "../league/LeagueProvider";
// no week redirect utilities needed in this file anymore

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
  // New flow: send authenticated users to landing page to choose league or create/join
  const target = to || "/landing";
  return <Navigate to={target} replace />;
}

export function RequireLeagueMember({ fallback = "/leagues/join" }: { fallback?: string }){
  const { loading, role } = useLeague();
  if (loading) return null;
  if (role === "none") return <Navigate to={fallback} replace />;
  return <Outlet />;
}
