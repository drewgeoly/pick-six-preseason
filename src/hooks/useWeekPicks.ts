// src/hooks/useWeekPicks.ts
import { useEffect, useMemo, useState, useCallback } from "react";
import { collection, doc, getDoc, onSnapshot, serverTimestamp, setDoc } from "firebase/firestore";
import { db } from "../lib/firebase";
import { useAuth } from "../auth/AuthProvider";

export type WeekGame = {
  eventKey: string;
  startTime: string;
  home?: string;
  away?: string;
  decided?: boolean;
  winner?: "home" | "away" | "tie";
  finalScoreHome?: number;
  finalScoreAway?: number;
};

export function useWeekPicks(leagueId?: string | null, weekId?: string) {
  const { user } = useAuth();
  const [games, setGames] = useState<WeekGame[]>([]);
  const [deadline, setDeadline] = useState<Date | null>(null);
  const [locked, setLocked] = useState(false);
  const [sel, setSel] = useState<Record<string, "home" | "away">>({});
  const [tiebreaker, setTiebreaker] = useState<number | "">("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!leagueId || !weekId) return;
    const wref = doc(db, "leagues", leagueId, "weeks", weekId);
    (async () => {
      const ws = await getDoc(wref);
      const w = ws.data();
      setDeadline(w?.deadline?.toDate ? w.deadline.toDate() : (w?.deadline ? new Date(w.deadline) : null));
      setLocked(Boolean(w?.locked));
    })();

    const unsubGames = onSnapshot(collection(wref, "games"), (snap) => {
      const list = snap.docs
        .map((d) => ({ eventKey: d.id, ...(d.data() as any) }))
        .sort((a, b) => +new Date(a.startTime) - +new Date(b.startTime));
      setGames(list as WeekGame[]);
    });

    let unsubPicks: undefined | (() => void);
    if (user) {
      unsubPicks = onSnapshot(doc(db, "leagues", leagueId, "weeks", weekId, "userPicks", user.uid), (ps) => {
        const p = ps.data() as any;
        if (p) {
          setSel(p.selections || {});
          setTiebreaker(typeof p.tiebreaker === "number" ? p.tiebreaker : "");
        } else {
          setSel({});
          setTiebreaker("");
        }
      });
    }

    return () => {
      unsubGames();
      if (unsubPicks) unsubPicks();
    };
  }, [leagueId, weekId, user?.uid]);

  const canEdit = useMemo(() => {
    if (locked) return false;
    if (!deadline) return true;
    return new Date() < deadline;
  }, [locked, deadline]);

  const save = useCallback(async () => {
    if (!user || !leagueId || !weekId) return;
    setSaving(true);
    await setDoc(
      doc(db, "leagues", leagueId, "weeks", weekId, "userPicks", user.uid),
      {
        selections: sel,
        tiebreaker: tiebreaker === "" ? null : Number(tiebreaker),
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
    setSaving(false);
  }, [user?.uid, leagueId, weekId, sel, tiebreaker]);

  return {
    user,
    games,
    deadline,
    locked,
    canEdit,
    sel,
    setSel,
    tiebreaker,
    setTiebreaker,
    saving,
    save,
  } as const;
}
