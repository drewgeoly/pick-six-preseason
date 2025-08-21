import { useEffect, useState } from "react";
import { collection, doc, getDocs, updateDoc } from "firebase/firestore";
import { db } from "../lib/firebase";

export default function AdminUsers() {
  const [rows, setRows] = useState<any[]>([]);

  useEffect(() => {
    (async () => {
      const snap = await getDocs(collection(db, "users"));
      setRows(snap.docs.map(d => ({ uid:d.id, ...d.data() })));
    })();
  }, []);

  async function setRole(uid: string, role: "player"|"admin") {
    await updateDoc(doc(db,"users",uid), { role });
    setRows(r => r.map(x => x.uid===uid ? {...x, role} : x));
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <h1 className="text-2xl font-semibold mb-4">Users</h1>
      <table className="w-full text-sm">
        <thead><tr><th className="text-left py-2">Name</th><th>Email</th><th>Role</th><th></th></tr></thead>
        <tbody>
          {rows.map(u => (
            <tr key={u.uid} className="border-t">
              <td className="py-2">{u.displayName || "Player"}</td>
              <td>{u.email ?? "—"}</td>
              <td>{u.role}</td>
              <td className="text-right">
                {u.role !== "admin" && <button className="btn" onClick={()=>setRole(u.uid,"admin")}>Make admin</button>}
                {u.role === "admin" && <button className="btn ml-2" onClick={()=>setRole(u.uid,"player")}>Make player</button>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
