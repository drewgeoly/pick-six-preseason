// src/pages/AdminSelectGames.tsx
import { useEffect, useMemo, useState } from "react";
import { getFunctions, httpsCallable } from "firebase/functions";
import { listEventsNCAAF } from "../lib/oddsApi";
import { db } from "../lib/firebase";
import {
  collection,
  doc,
  serverTimestamp,
  setDoc,
  writeBatch,
  getDocs,
} from "firebase/firestore";
import { useLeague } from "../league/LeagueProvider";
import { FALLBACK_WEEK_ID } from "../lib/weeks";

type UiEvent = {
  key: string;           // stable id for checkbox
  name: string;          // "Away @ Home"
  startTime: string;     // ISO
  home?: string;
  away?: string;
};

// (Optional) Could support sport scoping later if API allows.

async function fetchUpcomingUiEvents(options?: { todayOnly?: boolean }): Promise<UiEvent[]> {
  const from = new Date();
  let events: Array<{ id:string; commence_time:string; home_team:string; away_team:string }> = await listEventsNCAAF({ from });

  let list = events
    .filter(e => new Date(e.commence_time).getTime() > Date.now())
    .map(e => ({
      key: e.id,
      name: `${e.away_team} @ ${e.home_team}`,
      startTime: e.commence_time,
      home: e.home_team,
      away: e.away_team,
    }));

  if (options?.todayOnly) {
    const todayStr = new Date().toDateString();
    list = list.filter(ev => new Date(ev.startTime).toDateString() === todayStr);
  }

  return list.sort((a, b) => +new Date(a.startTime) - +new Date(b.startTime));
}

async function autoSeedFromOddsApi(leagueId: string, weekId: string, options?: { todayOnly?: boolean }) {
  // Normalize to UiEvent so we can rely on startTime/home/away/name fields
  const events = await fetchUpcomingUiEvents(options);
  const upcoming = events.slice(0, 6);
  if (upcoming.length < 6) throw new Error("Not enough upcoming games to seed.");

  const earliest = new Date(Math.min(...upcoming.map(e => new Date(e.startTime).getTime())));
  const deadline = new Date(earliest.getTime() - 60 * 60 * 1000);

  const wref = doc(db, "leagues", leagueId, "weeks", weekId);
  await setDoc(wref, {
    weekId,
    // Set startTime so pages can order weeks reliably
    startTime: earliest,
    locked: false,
    deadline,
    tiebreakerEventKey: upcoming[0]?.key || null,
    sportKey: "americanfootball_ncaaf",
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  }, { merge: true });

  // Set league.currentWeekId to this week
  await setDoc(doc(db, "leagues", leagueId), {
    currentWeekId: weekId,
    updatedAt: serverTimestamp(),
  }, { merge: true });

  const batch = writeBatch(db);
  const gamesCol = collection(wref, "games");
  // Clear previous games for this week
  const prev = await getDocs(gamesCol);
  prev.forEach((d) => batch.delete(d.ref));

  for (const ev of upcoming) {
    batch.set(doc(gamesCol, ev.key), {
      eventKey: ev.key,
      name: ev.name,
      startTime: ev.startTime,
      home: ev.home,
      away: ev.away,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }, { merge: true });
  }
  await batch.commit();
}

export default function AdminSelectGames() {
  const { leagueId } = useLeague();
  const [events, setEvents] = useState<UiEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [weekId, setWeekId] = useState(FALLBACK_WEEK_ID);
  const [todayOnly, setTodayOnly] = useState(false);
  const [tiebreakerKey, setTiebreakerKey] = useState<string | null>(null);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [pickStatus, setPickStatus] = useState<{ complete: string[]; missing: string[] }>({ complete: [], missing: [] });
  const [reminding, setReminding] = useState(false);

  const selectedEvents = useMemo(
    () => events.filter((e) => selected[e.key]),
    [events, selected]
  );
  const maxReached = selectedEvents.length >= 6;
  useEffect(() => {
    // default tiebreaker to first selected if not set
    if (!tiebreakerKey && selectedEvents.length > 0) {
      setTiebreakerKey(selectedEvents[0].key);
    } else if (tiebreakerKey && !selected[tiebreakerKey]) {
      // if deselected, move to first available
      setTiebreakerKey(selectedEvents[0]?.key || null);
    }
  }, [selectedEvents.map(e=>e.key).join(','), tiebreakerKey, selected]);

  async function refresh() {
    setLoading(true);
    setErr("");
    try {
      const list = await fetchUpcomingUiEvents({ todayOnly });
      setEvents(list);
    } catch (e: any) {
      setErr(e.message || "Failed to load events");
      setEvents([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [todayOnly]);

  // Load existing week selections and tiebreaker
  useEffect(() => {
    if (!leagueId || !weekId) return;
    let isMounted = true;
    (async () => {
      try {
        const wref = doc(db, "leagues", leagueId, "weeks", weekId);
        const [wSnap, gSnap] = await Promise.all([
          (await import("firebase/firestore")).getDoc(wref),
          (await import("firebase/firestore")).getDocs(collection(wref, "games")),
        ]);
        if (!isMounted) return;
        const w = wSnap.data() as any | undefined;
        if (typeof w?.tiebreakerEventKey === 'string') {
          setTiebreakerKey(w.tiebreakerEventKey);
        }
        const gameIds = new Set(gSnap.docs.map(d => d.id));
        setSelected(() => {
          const map: Record<string, boolean> = {};
          for (const id of gameIds) map[id] = true;
          return map;
        });
      } catch {
        // ignore
      }
    })();
    return () => { isMounted = false; };
  }, [leagueId, weekId]);

  // Reconcile selections when the events list changes (only keep those that still exist)
  useEffect(() => {
    if (!events.length) return;
    setSelected((sel) => {
      const allowed = new Set(events.map(e => e.key));
      const next: Record<string, boolean> = {};
      Object.entries(sel).forEach(([k, v]) => { if (v && allowed.has(k)) next[k] = true; });
      return next;
    });
  }, [events.map(e=>e.key).join(',')]);

  // Load pick status for current week
  useEffect(() => {
    (async () => {
      if (!leagueId || !weekId) return;
      try {
        const memSnap = await getDocs(collection(db, "leagues", leagueId, "members"));
        const mem = memSnap.docs.map(d => ({ uid: d.id, ...(d.data() as any) })).map(m => ({ uid: m.uid, email: m.email, name: m.displayName || m.name }));
        const picksSnap = await getDocs(collection(db, "leagues", leagueId, "weeks", weekId, "userPicks"));
        const byUid: Record<string, any> = {};
        picksSnap.docs.forEach(d => { byUid[d.id] = d.data(); });
        const complete: string[] = [];
        const missing: string[] = [];
        for (const m of mem) {
          const p = byUid[m.uid];
          const selections = p?.selections ? Object.keys(p.selections) : [];
          const tb = p?.tiebreaker;
          const done = selections.length === 6 && typeof tb === 'number';
          (done ? complete : missing).push(m.uid);
        }
        setPickStatus({ complete, missing });
      } catch (e) {
        // noop
      }
    })();
  }, [leagueId, weekId, msg]);

  async function onSendReminders() {
    if (!leagueId || !weekId) return;
    setReminding(true); setErr(""); setMsg("");
    try {
      const fn = httpsCallable(getFunctions(), "sendPickReminders");
      const res: any = await fn({ leagueId, weekId });
      setMsg(res?.data?.message || `Reminders queued (sent/logged: ${res?.data?.sent ?? res?.data?.logged ?? 0}).`);
    } catch (e: any) {
      setErr(e?.message || "Failed to send reminders");
    } finally {
      setReminding(false);
    }
  }

  async function handleAutoSeed() {
    if (!leagueId) { setErr("Select or create a league first."); return; }
    try {
      await autoSeedFromOddsApi(leagueId, weekId, { todayOnly });
      setMsg(`Seeded 6 games for ${weekId}`);
    } catch (e: any) {
      setErr(e.message || "Failed to seed games");
    }
  }

  async function saveWeek() {
    if (!leagueId) { setErr("Select or create a league first."); return; }
    if (selectedEvents.length !== 6) { setErr("Please select exactly 6 games."); return; }

    const earliest = new Date(
      Math.min(...selectedEvents.map((e) => new Date(e.startTime).getTime()))
    );
    const deadline = new Date(earliest.getTime() - 60 * 60 * 1000); // minus 1 hour

    const batch = writeBatch(db);
    const weekRef = doc(db, "leagues", leagueId, "weeks", weekId);
    batch.set(
      weekRef,
      {
        weekId,
        title: weekId,
        // Include startTime for ordering in History/Leaderboard
        startTime: earliest,
        deadline,
        locked: false,
        tiebreakerEventKey: tiebreakerKey || selectedEvents[0].key,
        sportKey: "americanfootball_ncaaf",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );

    const gamesCol = collection(weekRef, "games");
    // Remove any previously saved games so only current six remain
    const existing = await getDocs(gamesCol);
    existing.forEach((d) => batch.delete(d.ref));
    for (const ev of selectedEvents) {
      batch.set(doc(gamesCol, ev.key), {
        name: ev.name,
        startTime: ev.startTime,
        eventKey: ev.key,
        home: ev.home || "",
        away: ev.away || "",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
    await batch.commit();
    // Set league.currentWeekId to this saved week
    await setDoc(doc(db, "leagues", leagueId), { currentWeekId: weekId, updatedAt: serverTimestamp() }, { merge: true });
    setMsg("Week saved!");
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <h1 className="text-2xl font-semibold mr-auto">Select this week’s 6 games</h1>
        <div className="flex items-center gap-3 text-sm"><span className="text-slate-600">League:</span> <span className="font-medium">NCAA Football</span></div>
        <label className="text-sm inline-flex items-center gap-2 ml-2">
          <input type="checkbox" checked={todayOnly} onChange={(e)=>setTodayOnly(e.target.checked)} /> Today only
        </label>
        <button className="btn" onClick={refresh}>Refresh</button>
        <button className="btn" onClick={handleAutoSeed}>Auto-pull 6</button>
      </div>

      <div className="mb-4 flex gap-2 items-center">
        <label className="text-sm">Week ID</label>
        <input
          className="border rounded px-2 py-1"
          value={weekId}
          onChange={(e) => setWeekId(e.target.value)}
          placeholder="e.g., YYYY-W01"
        />
        <span className="ml-auto text-sm">Selected: {selectedEvents.length}/6</span>
        <button className="btn" onClick={saveWeek}>Save Week</button>
      </div>
      {/* Pick status and reminders */}
      <div className="mb-3 flex items-center gap-3 text-sm">
        <span className="badge-light">Complete: {pickStatus.complete.length}</span>
        <span className="badge-light">Missing: {pickStatus.missing.length}</span>
        <button
          className="btn"
          onClick={onSendReminders}
          disabled={reminding || pickStatus.missing.length === 0}
        >
          {reminding ? 'Sending…' : 'Send reminders'}
        </button>
      </div>
      {err && <div className="text-red-600 mb-2 text-sm">{err}</div>}
      {msg && <div className="text-emerald-700 mb-2 text-sm">{msg}</div>}
      <div className="text-xs text-gray-600 mb-2">Choose up to 6 games. Once 6 are selected, other checkboxes will be disabled.</div>
      
      {loading ? (
        <div className="p-6">Loading…</div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {events.map((ev) => {
            const isChecked = !!selected[ev.key];
            const disabled = !isChecked && maxReached;
            return (
              <label
                key={ev.key}
                className={`card flex gap-3 items-start transition ${
                  isChecked ? "ring-1 ring-emerald-600 bg-emerald-50" : disabled ? "opacity-60" : ""
                }`}
              >
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={isChecked}
                  disabled={disabled}
                  onChange={(e) =>
                    setSelected((s) => ({ ...s, [ev.key]: e.target.checked }))
                  }
                />
                <div>
                  <div className="font-medium">{ev.name}</div>
                  <div className="text-sm text-gray-600">
                    {new Date(ev.startTime).toLocaleString()}
                  </div>
                  <div className="mt-2 text-xs flex items-center gap-2">
                    <input
                      type="radio"
                      name="tiebreaker"
                      disabled={!isChecked}
                      checked={tiebreakerKey === ev.key}
                      onChange={() => setTiebreakerKey(ev.key)}
                    />
                    <span className={`${tiebreakerKey === ev.key ? "text-emerald-700 font-medium" : "text-slate-600"}`}>
                      Tiebreaker game
                    </span>
                  </div>
                </div>
              </label>
            );
          })}
        </div>
      )}
    </div>
  );
}
