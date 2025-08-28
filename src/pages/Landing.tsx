// src/pages/Landing.tsx
import { useEffect, useMemo, useState } from "react";
import { collection, getDocs } from "firebase/firestore";
import { db } from "../lib/firebase";
import { useAuth } from "../auth/AuthProvider";
import { useNavigate } from "react-router-dom";
import { FALLBACK_WEEK_ID, readLastWeekId } from "../lib/weeks";

export default function Landing() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<{ id: string; name?: string }[]>([]);

  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        const snap = await getDocs(collection(db, "users", user.uid, "leagues"));
        setItems(snap.docs.map(d => ({ id: d.id, ...(d.data() as any) })));
      } finally {
        setLoading(false);
      }
    })();
  }, [user?.uid]);

  const content = useMemo(() => {
    if (loading) {
      return (
        <div className="space-y-3">
          <div className="h-10 bg-slate-200/80 dark:bg-slate-700/60 rounded animate-pulse" />
          <div className="h-10 bg-slate-200/80 dark:bg-slate-700/60 rounded animate-pulse" />
          <div className="h-10 bg-slate-200/80 dark:bg-slate-700/60 rounded animate-pulse" />
        </div>
      );
    }
    if (items.length === 0) {
      return (
        <div className="space-y-4">
          <p className="text-sm text-slate-600">You're not in any leagues yet.</p>
          <div className="flex gap-3">
            <button
              className="btn"
              onClick={() => navigate("/leagues/create")}
            >
              Create a League
            </button>
            <button
              className="btn-light"
              onClick={() => navigate("/leagues/join")}
            >
              Join a League
            </button>
          </div>
        </div>
      );
    }
    return (
      <div className="space-y-3">
        <div>
          <h2 className="text-xl font-semibold">Choose your league</h2>
          <p className="text-sm text-slate-600">Jump back into any league you belong to.</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {items.map((l) => (
            <button
              key={l.id}
              className="card text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500"
              onClick={() => {
                localStorage.setItem("lastLeagueId", l.id);
                const week = readLastWeekId(l.id) || FALLBACK_WEEK_ID;
                navigate(`/l/${l.id}/leaderboard/${week}`);
              }}
            >
              <div className="font-medium">{l.name || "League"}</div>
              <div className="text-xs opacity-70">Tap to enter</div>
            </button>
          ))}
        </div>
        <div className="pt-2">
          <button className="btn-light" onClick={() => navigate("/leagues/create")}>Create another league</button>
        </div>
      </div>
    );
  }, [items, loading, navigate]);

  if (!user) return <div className="p-6">Please log in.</div>;

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-4">
      <h1 className="text-2xl font-bold">Welcome</h1>
      {content}
    </div>
  );
}
