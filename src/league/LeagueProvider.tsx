import { createContext, useContext, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { doc, getDoc } from "firebase/firestore";
import { db } from "../lib/firebase";
import { useAuth } from "../auth/AuthProvider";

type Role = "owner" | "admin" | "member" | "none";
type Ctx = { leagueId: string; role: Role; loading: boolean; code: string | null };

const LeagueCtx = createContext<Ctx>({ leagueId: "", role: "none", loading: true, code: null });

export default function LeagueProvider({ children }: { children: React.ReactNode }) {
  const { leagueId = "" } = useParams();
  const { user } = useAuth();
  const [role, setRole] = useState<Role>("none");
  const [loading, setLoading] = useState(true);
  const [code, setCode] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      if (!leagueId || !user) { setRole("none"); setCode(null); setLoading(false); return; }
      const m = await getDoc(doc(db, "leagues", leagueId, "members", user.uid));
      setRole((m.data()?.role as Role) || "none");
      // Fetch league document to get joinCode (if present)
      const leagueDoc = await getDoc(doc(db, "leagues", leagueId));
      setCode((leagueDoc.data()?.code as string) || null);
      // Remember last visited league id for smarter navigation
      try { localStorage.setItem("lastLeagueId", leagueId); } catch {}
      setLoading(false);
    })();
  }, [leagueId, user?.uid]);

  return <LeagueCtx.Provider value={{ leagueId, role, loading, code }}>{children}</LeagueCtx.Provider>;
}

export function useLeague(){ return useContext(LeagueCtx); }
