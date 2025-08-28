import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { useEffect, useState } from "react";
import { db } from "../lib/firebase";

export default function AdminSettings() {
  const ref = doc(db, "settings", "app");
  const [points, setPoints] = useState(1);
  const [mode, setMode] = useState<"classic"|"stroke+match">("classic");
  const [showAfterLock, setShowAfterLock] = useState(true);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    (async () => {
      const s = await getDoc(ref);
      if (s.exists()) {
        const d = s.data();
        setPoints(d.pointsPerCorrect ?? 1);
        setMode(d.scoringMode ?? "classic");
        setShowAfterLock(d.showPicksOnlyAfterLock ?? true);
      }
    })();
  }, []);

  async function save() {
    await setDoc(ref, {
      pointsPerCorrect: points,
      scoringMode: mode,
      showPicksOnlyAfterLock: showAfterLock,
      updatedAt: serverTimestamp()
    }, { merge: true });
    setMsg("Settings saved.");
  }

  return (
    <div className="p-6 max-w-xl mx-auto card space-y-3">
      <h1 className="text-xl font-semibold">Settings</h1>
      {msg && <div className="text-emerald-700 text-sm">{msg}</div>}
      <label className="block">
        <div className="text-sm">Points per correct</div>
        <input className="border px-2 py-1 rounded" type="number" value={points} onChange={e=>setPoints(+e.target.value)} />
      </label>
      <label className="block">
        <div className="text-sm">Scoring mode</div>
        <select className="border px-2 py-1 rounded" value={mode} onChange={e=>setMode(e.target.value as any)}>
          <option value="classic">Classic (total correct)</option>
          <option value="stroke+match">Stroke + Match</option>
        </select>
      </label>
      <label className="flex items-center gap-2">
        <input type="checkbox" checked={showAfterLock} onChange={e=>setShowAfterLock(e.target.checked)} />
        Show picks only after lock
      </label>
      <button className="btn" onClick={save}>Save</button>
    </div>
  );
}
