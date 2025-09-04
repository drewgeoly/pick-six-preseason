// src/lib/weeks.ts
import { collection, doc, getDoc, getDocs } from "firebase/firestore";
import { db } from "./firebase";

// Fallback when we cannot determine a better week
export function computeFallbackWeekId(date: Date = new Date()): string {
  const year = date.getFullYear();
  return `${year}-W01`;
}

export const FALLBACK_WEEK_ID = computeFallbackWeekId();

// Display-friendly label for week IDs like "2025-W01" -> "Week 1 (2025)"
export function formatWeekLabel(weekId: string): string {
  const m = weekId.match(/^(\d{4})-W(\d{2})$/);
  if (!m) return weekId;
  const year = m[1];
  const n = parseInt(m[2], 10);
  return `Week ${n} (${year})`;
}

// Persist the last visited week per league
export function rememberLastWeekId(leagueId: string, weekId: string) {
  try { localStorage.setItem(`lastWeekId:${leagueId}`, weekId); } catch {}
}
export function readLastWeekId(leagueId: string): string | null {
  try { return localStorage.getItem(`lastWeekId:${leagueId}`); } catch { return null; }
}

// Try to pick a sensible default week based on league weeks collection
export async function getDefaultWeekId(leagueId: string): Promise<string> {
  try {
    // Prefer league.currentWeekId if set
    try {
      const lref = doc(db, "leagues", leagueId);
      const lsnap = await getDoc(lref);
      const cur = (lsnap.data() as any)?.currentWeekId as (string | undefined);
      if (cur && typeof cur === 'string') return cur;
    } catch {}

    const snap = await getDocs(collection(db, "leagues", leagueId, "weeks"));
    if (snap.empty) return FALLBACK_WEEK_ID;
    const weeks = snap.docs.map((d) => {
      const data = d.data() as any;
      const deadline = data?.deadline?.toDate
        ? data.deadline.toDate()
        : data?.deadline
          ? new Date(data.deadline)
          : null;
      return { id: d.id, deadline } as { id: string; deadline: Date | null };
    });
    const now = new Date();
    const upcoming = weeks
      .filter((w) => w.deadline && w.deadline.getTime() >= now.getTime())
      .sort((a, b) => (a.deadline!.getTime() - b.deadline!.getTime()));
    if (upcoming.length) return upcoming[0].id;
    const past = weeks
      .filter((w) => w.deadline && w.deadline.getTime() < now.getTime())
      .sort((a, b) => (b.deadline!.getTime() - a.deadline!.getTime()));
    if (past.length) return past[0].id;
    // Otherwise just take the first
    return weeks[0].id;
  } catch {
    return FALLBACK_WEEK_ID;
  }
}
