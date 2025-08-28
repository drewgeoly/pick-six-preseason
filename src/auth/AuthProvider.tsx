import { type ReactNode, createContext, useContext, useEffect, useState } from "react";
import { type User, onAuthStateChanged } from "firebase/auth";
import { auth, db } from "../lib/firebase";
import { doc, serverTimestamp, setDoc, getDoc, updateDoc } from "firebase/firestore";

type Ctx = { user: User | null; loading: boolean };
const AuthCtx = createContext<Ctx>({ user: null, loading: true });
export const useAuth = () => useContext(AuthCtx);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Ensure we always clear loading, even if Firestore throws
    return onAuthStateChanged(auth, async (u) => {
      try {
        setUser(u);
        if (!u) return;
  
        const ref = doc(db, "users", u.uid);
        const snap = await getDoc(ref);
  
        if (!snap.exists()) {
          await setDoc(ref, {
            displayName: u.displayName ?? "",
            avatarUrl: u.photoURL ?? null,
            role: "player",
            stats: { wins: 0, losses: 0, accuracy: 0 },
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
            // (optional) store email if you want it in AdminUsers
            email: u.email ?? null,
          });
        } else {
          await updateDoc(ref, { updatedAt: serverTimestamp() });
        }
      } catch (e) {
        console.error("AuthProvider error:", e);
      } finally {
        setLoading(false);
      }
    });
  }, []);
  

  return <AuthCtx.Provider value={{ user, loading }}>{children}</AuthCtx.Provider>;
}
