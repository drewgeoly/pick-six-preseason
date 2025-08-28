import { useEffect, useState } from "react";
import { collection, getDocs } from "firebase/firestore";
import { db } from "../lib/firebase";
import { useAuth } from "../auth/AuthProvider";
import { useLeague } from "../league/LeagueProvider";
import { useNavigate } from "react-router-dom";
import { FALLBACK_WEEK_ID, readLastWeekId } from "../lib/weeks";

export default function LeagueSwitcher(){
  const { user } = useAuth();
  const { leagueId } = useLeague();
  const [items, setItems] = useState<{id:string; name:string}[]>([]);
  const nav = useNavigate();

  useEffect(()=>{ (async()=>{
    if(!user) return;
    const snap = await getDocs(collection(db,"users",user.uid,"leagues"));
    const list = snap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));
    setItems(list);
    // if we have leagues but no leagueId in URL, you can choose to auto-jump to last or first
  })(); },[user?.uid]);

  if(!user || items.length === 0) return null;

  return (
    <select
      value={leagueId || ""}
      onChange={(e) => {
        const id = e.target.value;
        localStorage.setItem("lastLeagueId", id);
        const week = readLastWeekId(id) || FALLBACK_WEEK_ID;
        nav(`/l/${id}/leaderboard/${week}`);
      }}
      className="border rounded px-2 py-1 text-sm bg-white text-emerald-900"
      aria-label="Select league"
    >
      {!leagueId && <option value="" disabled>Select a league</option>}
      {items.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
    </select>
  );
}
