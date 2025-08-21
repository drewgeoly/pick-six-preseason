import { Navigate, Outlet } from "react-router-dom";
import { useEffect, useState } from "react";
import { useAuth } from "./AuthProvider";
import { useLeague } from "../league/LeagueProvider";
import { collection, getDocs, limit, orderBy, query } from "firebase/firestore";
import { db } from "../lib/firebase";

export function RequireAuth({ fallback = "/login" }: { fallback?: string }) {
  const { user, loading } = useAuth();
  if (loading) return null; // or a spinner
  if (!user) return <Navigate to={fallback} replace />;
  return <Outlet />;
}

export function RedirectIfAuth({ to }: { to?: string }) {
  const { user, loading } = useAuth();
  const [target, setTarget] = useState<string | null>(null);
  useEffect(() => {
    if (loading) return;
    if (!user) { setTarget(null); return; }
    const last = localStorage.getItem("lastLeagueId");
    if (last) { setTarget(to || `/l/${last}/leaderboard/2025-W01`); return; }
    // Fallback: find the most recently joined league from reverse index
    (async () => {
      try {
        const q = query(collection(db, "users", user.uid, "leagues"), orderBy("joinedAt", "desc"), limit(1));
        const snap = await getDocs(q);
        if (!snap.empty) {
          const docId = snap.docs[0].id;
          localStorage.setItem("lastLeagueId", docId);
          setTarget(to || `/l/${docId}/leaderboard/2025-W01`);
        } else {
          setTarget("/leagues/start");
        }
      } catch {
        setTarget("/leagues/start");
      }
    })();
  }, [user, loading, to]);

  if (loading) return null;
  if (!user) return <Outlet />;
  if (!target) return null; // wait for decision
  return <Navigate to={target} replace />;
}

export function RequireLeagueMember({ fallback = "/leagues/join" }: { fallback?: string }){
  const { loading, role } = useLeague();
  if (loading) return null;
  if (role === "none") return <Navigate to={fallback} replace />;
  return <Outlet />;
}
