import { useEffect, useState } from "react";
import { collection, doc, getDoc, getDocs, orderBy, query } from "firebase/firestore";
import { db } from "../lib/firebase";
import { useLeague } from "../league/LeagueProvider";

type MemberRow = { uid: string; role: string; joinedAt?: any; displayName?: string; avatarUrl?: string };

export default function Members(){
  const { leagueId } = useLeague();
  const [rows, setRows] = useState<MemberRow[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!leagueId) return;
    (async () => {
      setLoading(true);
      try {
        const snap = await getDocs(query(collection(db, "leagues", leagueId, "members"), orderBy("joinedAt", "asc")));
        const base = snap.docs.map(d => ({ uid: d.id, ...(d.data() as any) }));
        const withProfiles = await Promise.all(base.map(async (m) => {
          try {
            const u = await getDoc(doc(db, "users", m.uid));
            const ud = u.data() as any || {};
            return { ...m, displayName: ud.displayName || ud.email || m.uid, avatarUrl: ud.avatarUrl || null } as MemberRow;
          } catch { return m as MemberRow; }
        }));
        setRows(withProfiles);
      } finally { setLoading(false); }
    })();
  }, [leagueId]);

  if (!leagueId) return <div className="p-6">Select a league first.</div>;

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold">Members</h2>
      {loading ? (
        <div>Loading...</div>
      ) : (
        <ul className="divide-y rounded-md border bg-white">
          {rows.map((m) => (
            <li key={m.uid} className="p-3 flex items-center gap-3">
              {m.avatarUrl ? (
                <img src={m.avatarUrl} alt={m.displayName} className="w-8 h-8 rounded-full object-cover"/>
              ) : (
                <div className="w-8 h-8 rounded-full bg-slate-200 grid place-items-center text-xs font-semibold">
                  {(m.displayName || "?").slice(0,2).toUpperCase()}
                </div>
              )}
              <div className="flex-1">
                <div className="font-medium">{m.displayName || m.uid}</div>
                <div className="text-xs text-slate-500">Role: {m.role || "member"}</div>
              </div>
            </li>
          ))}
          {rows.length === 0 && (
            <li className="p-3 text-slate-500">No members yet.</li>
          )}
        </ul>
      )}
    </div>
  );
}
