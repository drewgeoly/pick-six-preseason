import { useEffect, useState } from "react";
import { collection, doc, getDoc, getDocs } from "firebase/firestore";
import { db } from "../lib/firebase";
import { useParams } from "react-router-dom";

export default function PublicProfile() {
  const { uid = "" } = useParams();
  const [user, setUser] = useState<any>(null);
  const [weeks, setWeeks] = useState<{weekId:string; correct?:number}[]>([]);

  useEffect(() => {
    (async () => {
      const u = await getDoc(doc(db, "users", uid));
      setUser(u.data());
      // Pull week scores for the user across all weeks
      const weeksSnap = await getDocs(collection(db, "weeks"));
      const arr: {weekId:string; correct?:number}[] = [];
      for (const w of weeksSnap.docs) {
        const s = await getDoc(doc(db, "weeks", w.id, "scores", uid));
        if (s.exists()) arr.push({ weekId: w.id, correct: s.data()?.correct });
      }
      arr.sort((a,b)=> a.weekId.localeCompare(b.weekId));
      setWeeks(arr);
    })();
  }, [uid]);

  if (!user) return <div className="p-6">Loading…</div>;

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-4">
      <div className="flex items-center gap-4">
        {user.avatarUrl && <img src={user.avatarUrl} className="w-16 h-16 rounded-full" />}
        <div>
          <h1 className="text-2xl font-semibold">{user.displayName || "Player"}</h1>
          <div className="text-gray-600 text-sm">
            Season: {user.season?.correct ?? 0} correct · {(user.season?.accuracy? (user.season.accuracy*100).toFixed(1):"0.0")}%
          </div>
        </div>
      </div>

      <div className="card">
        <h2 className="text-lg font-medium mb-2">Week-by-week</h2>
        <ul className="space-y-1 text-sm">
          {weeks.map(w => <li key={w.weekId} className="border-t py-2">{w.weekId}: {w.correct ?? 0} correct</li>)}
        </ul>
      </div>
    </div>
  );
}
