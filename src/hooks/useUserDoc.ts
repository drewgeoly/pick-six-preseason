import { useEffect, useState } from "react";
import { db } from "../lib/firebase";
import { doc, onSnapshot } from "firebase/firestore";
import { useAuth } from "../auth/AuthProvider";

export function useUserDoc() {
  const { user } = useAuth();
  const [data, setData] = useState<any>(null);
  useEffect(() => {
    if (!user) return;
    return onSnapshot(doc(db, "users", user.uid), (snap) => setData(snap.data() || null));
  }, [user]);
  return data;
}
