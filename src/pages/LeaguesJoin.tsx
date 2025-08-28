import { collection, doc, getDocs, query, serverTimestamp, setDoc, where } from "firebase/firestore";
import { db } from "../lib/firebase";
import { useAuth } from "../auth/AuthProvider";
import { useNavigate } from "react-router-dom";
import { useState } from "react";
import { FALLBACK_WEEK_ID, getDefaultWeekId } from "../lib/weeks";

export default function LeaguesJoin(){
  const { user } = useAuth(); const nav = useNavigate();
  const [err,setErr] = useState("");

  async function onSubmit(e: React.FormEvent<HTMLFormElement>){
    e.preventDefault();
    const code = (new FormData(e.currentTarget).get("code") as string).trim().toUpperCase();
    if (!user) return;

    const qSnap = await getDocs(query(collection(db,"leagues"), where("code","==",code)));
    if (qSnap.empty){ setErr("Invalid code"); return; }
    const league = qSnap.docs[0]; const data = league.data() as any;

    // Enforce capacity if maxMembers is set
    if (typeof data.maxMembers === "number" && data.maxMembers > 0){
      const membersSnap = await getDocs(collection(db, "leagues", league.id, "members"));
      if (membersSnap.size >= data.maxMembers){
        setErr("This league is full.");
        return;
      }
    }

    // membership
    await setDoc(doc(db,"leagues",league.id,"members",user.uid), {
      role:"member", joinedAt: serverTimestamp()
    }, { merge:true });
    // reverse index
    await setDoc(doc(db,"users",user.uid,"leagues",league.id), {
      name: data.name, role:"member", joinedAt: serverTimestamp()
    });

    // remember last league
    localStorage.setItem("lastLeagueId", league.id);

    const week = await getDefaultWeekId(league.id).catch(()=>FALLBACK_WEEK_ID);
    nav(`/l/${league.id}/leaderboard/${week}`);
  }

  return (
    <form onSubmit={onSubmit} className="p-6 max-w-md mx-auto space-y-3">
      <h1 className="text-2xl font-semibold">Join league</h1>
      <input name="code" required placeholder="Invite code (e.g., ABC123)" className="border rounded px-3 py-2 w-full"/>
      {err && <div className="text-red-600 text-sm">{err}</div>}
      <button className="btn">Join</button>
    </form>
  );
}
