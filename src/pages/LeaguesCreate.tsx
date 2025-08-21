import { addDoc, collection, doc, getDocs, serverTimestamp, setDoc, query, where } from "firebase/firestore";
import { db } from "../lib/firebase";
import { useAuth } from "../auth/AuthProvider";
import { useNavigate } from "react-router-dom";

async function generateUniqueCode(): Promise<string> {
    const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no confusing chars
    const make = () => Array.from({length:6}, () => alphabet[Math.floor(Math.random()*alphabet.length)]).join("");
    let tries = 0;
    while (tries < 5) {
      const code = make();
      // check if any league already has this code
      const q = await getDocs(query(collection(db,"leagues"), where("code","==",code)));
      if (q.empty) return code;
      tries++;
    }
    // super-rare: fallback to 7 chars
    return make() + alphabet[Math.floor(Math.random()*alphabet.length)];
  }
export default function LeaguesCreate(){
  const { user } = useAuth(); const nav = useNavigate();

  async function onSubmit(e: React.FormEvent<HTMLFormElement>){
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const name = fd.get("name") as string;
    const maxMembersRaw = (fd.get("maxMembers") as string) || "50";
    const maxMembers = Math.max(2, Math.min(200, parseInt(maxMembersRaw, 10) || 50));
    if (!user) return;

    const code = await generateUniqueCode();
    const leagueRef = await addDoc(collection(db,"leagues"), {
      name, code, ownerUid: user.uid, maxMembers,
      createdAt: serverTimestamp(), updatedAt: serverTimestamp()
    });
    // membership (store a snapshot of name/email for reliable display)
    await setDoc(doc(db,"leagues",leagueRef.id,"members",user.uid), {
      role:"owner", joinedAt: serverTimestamp(),
      displayName: user.displayName ?? null,
      email: user.email ?? null,
    });
    // reverse index (what the switcher reads)
    await setDoc(doc(db,"users",user.uid,"leagues",leagueRef.id), {
      name, role:"owner", joinedAt: serverTimestamp()
    });

    // remember last league
    localStorage.setItem("lastLeagueId", leagueRef.id);

    nav(`/l/${leagueRef.id}/leaderboard/2025-W01`);
  }

  return (
    <form onSubmit={onSubmit} className="p-6 max-w-md mx-auto space-y-3">
      <h1 className="text-2xl font-semibold">Create league</h1>
      <input name="name" required placeholder="League name" className="border rounded px-3 py-2 w-full"/>
      <div className="text-sm text-slate-600">Set a max number of members (2–200).</div>
      <input name="maxMembers" type="number" min={2} max={200} defaultValue={50} className="border rounded px-3 py-2 w-full" />
      <button className="btn">Create</button>
    </form>
    
  );
}
