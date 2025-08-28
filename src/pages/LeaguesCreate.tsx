import { addDoc, collection, doc, serverTimestamp, setDoc } from "firebase/firestore";
import { db } from "../lib/firebase";
import { useAuth } from "../auth/AuthProvider";
import { useNavigate } from "react-router-dom";
import { FALLBACK_WEEK_ID, getDefaultWeekId } from "../lib/weeks";

async function generateUniqueCode(): Promise<string> {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no confusing chars
  const make = () => Array.from({ length: 6 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join("");
  let tries = 0;
  while (tries < 8) {
    const code = tries < 6 ? make() : make() + alphabet[Math.floor(Math.random() * alphabet.length)];
    try {
      // Reserve the code by creating leagueCodes/{code}. Rules allow create only if it does not exist.
      await setDoc(doc(db, "leagueCodes", code), { createdAt: serverTimestamp() });
      return code;
    } catch (e) {
      // create denied because it exists; try another
      tries++;
      continue;
    }
  }
  // Extremely unlikely; fallback
  return make() + alphabet[Math.floor(Math.random() * alphabet.length)];
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
    // membership
    await setDoc(doc(db,"leagues",leagueRef.id,"members",user.uid), {
      role:"owner", joinedAt: serverTimestamp()
    });
    // reverse index (what the switcher reads)
    await setDoc(doc(db,"users",user.uid,"leagues",leagueRef.id), {
      name, role:"owner", joinedAt: serverTimestamp()
    });

    // remember last league
    localStorage.setItem("lastLeagueId", leagueRef.id);

    const week = await getDefaultWeekId(leagueRef.id).catch(()=>FALLBACK_WEEK_ID);
    nav(`/l/${leagueRef.id}/leaderboard/${week}`);
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
