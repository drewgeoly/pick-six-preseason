// src/pages/AdminSelectGames.tsx
import { useEffect, useMemo, useState } from "react";
import { listEventsNCAAF, listEventsNFL, listEventsBySportKey } from "../lib/oddsApi";
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

async function fetchUpcomingUiEvents(options?: { sportKey?: string; todayOnly?: boolean }): Promise<UiEvent[]> {
  const from = new Date();
  let events: Array<{ id:string; commence_time:string; home_team:string; away_team:string }> = [];

  // If a full sport key is specified (e.g., americanfootball_nfl_preseason), use it directly
  if (options?.sportKey && options.sportKey.startsWith("americanfootball_")) {
    events = await listEventsBySportKey(options.sportKey, { from });
  } else {
    const useNFL = (options?.sportKey || "").toLowerCase().includes("nfl");
    events = useNFL ? await listEventsNFL({ from }) : await listEventsNCAAF({ from });
  }

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

async function autoSeedFromOddsApi(leagueId: string, weekId: string, options?: { sportKey?: string; todayOnly?: boolean }) {
  // Normalize to UiEvent so we can rely on startTime/home/away/name fields
  const events = await fetchUpcomingUiEvents(options);
  const upcoming = events.slice(0, 6);
  if (upcoming.length < 6) throw new Error("Not enough upcoming games to seed.");

  const earliest = new Date(Math.min(...upcoming.map(e => new Date(e.startTime).getTime())));

  const wref = doc(db, "leagues", leagueId, "weeks", weekId);
  await setDoc(wref, {
    weekId,
    locked: false,
    deadline: earliest,
    sportKey: options?.sportKey ?? null,
    createdAt: serverTimestamp(),
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
  const [sportKey, setSportKey] = useState<string | undefined>(undefined);
  const [mode, setMode] = useState<"ncaaf"|"nfl"|"custom">("ncaaf");
  const [todayOnly, setTodayOnly] = useState(false);
  const [preseason, setPreseason] = useState(false);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");

  const selectedEvents = useMemo(
    () => events.filter((e) => selected[e.key]),
    [events, selected]
  );
  const maxReached = selectedEvents.length >= 6;

  async function refresh() {
    setLoading(true);
    setErr("");
    try {
      const effectiveSportKey = mode === "custom"
        ? sportKey
        : mode === "nfl"
          ? (preseason ? "americanfootball_nfl_preseason" : "americanfootball_nfl")
          : "americanfootball_ncaaf";
      const list = await fetchUpcomingUiEvents({ sportKey: effectiveSportKey, todayOnly });
      setEvents(list);
    } catch (e: any) {
      setErr(e.message || "Failed to load events");
      setEvents([]);
    } finally {
      setLoading(false);
    }
  }

  // Reset preseason when switching away from NFL
  useEffect(() => {
    if (mode !== "nfl") setPreseason(false);
  }, [mode]);

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sportKey, todayOnly]);

  // Re-run when switching mode or toggling preseason so the list updates immediately
  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, preseason]);

  async function handleAutoSeed() {
    if (!leagueId) { setErr("Select or create a league first."); return; }
    try {
      const effectiveSportKey = mode === "custom"
        ? sportKey
        : mode === "nfl"
          ? (preseason ? "americanfootball_nfl_preseason" : "americanfootball_nfl")
          : "americanfootball_ncaaf";
      await autoSeedFromOddsApi(leagueId, weekId, { sportKey: effectiveSportKey, todayOnly });
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
    const effectiveSportKey = mode === "custom"
      ? sportKey
      : mode === "nfl"
        ? (preseason ? "americanfootball_nfl_preseason" : "americanfootball_nfl")
        : "americanfootball_ncaaf";
    const weekRef = doc(db, "leagues", leagueId, "weeks", weekId);
    batch.set(
      weekRef,
      {
        weekId,
        title: weekId,
        deadline,
        locked: false,
        sportKey: effectiveSportKey ?? null,
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
    setMsg("Week saved!");
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <h1 className="text-2xl font-semibold mr-auto">Select this week’s 6 games</h1>
        <div className="flex items-center gap-3 text-sm">
          <span className="text-slate-600">League:</span>
          <label className="inline-flex items-center gap-1">
            <input type="radio" name="mode" checked={mode==="ncaaf"} onChange={()=>setMode("ncaaf")} /> NCAAF
          </label>
          <label className="inline-flex items-center gap-1">
            <input type="radio" name="mode" checked={mode==="nfl"} onChange={()=>setMode("nfl")} /> NFL
          </label>
          {mode === "nfl" && (
            <label className="inline-flex items-center gap-1 ml-1">
              <input type="checkbox" checked={preseason} onChange={(e)=>setPreseason(e.target.checked)} /> Preseason
            </label>
          )}
          <label className="inline-flex items-center gap-1">
            <input type="radio" name="mode" checked={mode==="custom"} onChange={()=>setMode("custom")} /> Custom
          </label>
          {mode === "custom" && (
            <input
              className="border rounded px-2 py-1 ml-2"
              placeholder="custom sport key"
              value={sportKey || ""}
              onChange={(e)=>setSportKey(e.target.value || undefined)}
            />
          )}
        </div>
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
                </div>
              </label>
            );
          })}
        </div>
      )}
    </div>
  );
}
