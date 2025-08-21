import { useEffect, useState } from "react";
import { collection, getDocs } from "firebase/firestore";
import { db } from "../lib/firebase";
import { useAuth } from "../auth/AuthProvider";
import { useLeague } from "../league/LeagueProvider";
import { useNavigate } from "react-router-dom";

export default function LeagueSwitcher() {
  const { user } = useAuth();
  const { leagueId } = useLeague();
  const [items, setItems] = useState<{ id: string; name: string }[]>([]);
  const nav = useNavigate();

  useEffect(() => {
    if (!user) return;
    (async () => {
      // Reads the user's "reverse index" of leagues
      const snap = await getDocs(collection(db, "users", user.uid, "leagues"));
      setItems(snap.docs.map(d => ({ id: d.id, ...(d.data() as any) })));
    })();
  }, [user?.uid]);

  if (!user) return null;

  return (
    <select
      value={leagueId || ""}
      onChange={(e) => nav(`/l/${e.target.value}/leaderboard/2025-W01`)}
      className="border rounded px-2 py-1 text-sm"
      aria-label="Select league"
    >
      {items.map((l) => (
        <option key={l.id} value={l.id}>
          {l.name}
        </option>
      ))}
    </select>
  );
}
