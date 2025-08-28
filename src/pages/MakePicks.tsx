// src/pages/MakePicks.tsx
import { useEffect, useState } from "react";
import { useLeague } from "../league/LeagueProvider";
import { useParams } from "react-router-dom";
import { listSpreadsNCAAF } from "../lib/oddsApi";
// scoring types inlined by components
import type { EventSpread } from "../lib/oddsApi";
import { FALLBACK_WEEK_ID, formatWeekLabel, rememberLastWeekId } from "../lib/weeks";
import { useWeekPicks } from "../hooks/useWeekPicks";
import GameCard from "../components/GameCard";
// Tiebreaker inline input (modal removed per request)

// (types covered by hook and GameCard)

export default function MakePicks() {
  const { leagueId } = useLeague();
  const { weekId = FALLBACK_WEEK_ID } = useParams();
  const { user, games, linesLockAt, picksCloseAt, locked, linesLocked, picksClosed, canEdit, sel, setSel, tiebreaker, setTiebreaker, saving, save, tiebreakerEventKey } = useWeekPicks(leagueId, weekId);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [spreads, setSpreads] = useState<Record<string, { home?: { point: number | null; price: number | null }; away?: { point: number | null; price: number | null } }>>({});
  // no modal state

  useEffect(() => {
    if (leagueId && weekId) rememberLastWeekId(leagueId, weekId);
  }, [leagueId, weekId]);

  useEffect(() => {
    if (!games.length) return;
    let cancelled = false;

    const loadSpreads = async () => {
      const minStart = new Date(Math.min(...games.map(g => +new Date(g.startTime))));
      const maxStart = new Date(Math.max(...games.map(g => +new Date(g.startTime))));
      const from = new Date(minStart.getTime() - 24 * 60 * 60 * 1000);
      const to = new Date(maxStart.getTime() + 24 * 60 * 60 * 1000);
      try {
        const odds = await listSpreadsNCAAF({ from, to });
        if (cancelled) return;
        const map: Record<string, any> = {};
        odds.forEach((ev: EventSpread) => {
          map[ev.id] = {
            home: ev.home ? { point: ev.home.point ?? null, price: ev.home.price ?? null } : undefined,
            away: ev.away ? { point: ev.away.point ?? null, price: ev.away.price ?? null } : undefined,
          };
        });
        setSpreads(map);
      } catch {
        // ignore
      }
    };

    // initial load
    loadSpreads();

    // dynamic polling until lines lock
    let interval: number | undefined;
    const schedule = () => {
      if (interval) window.clearInterval(interval);
      const now = Date.now();
      const lockMs = linesLockAt ? +linesLockAt - now : Infinity;
      if (!Number.isFinite(lockMs) || lockMs <= 0) return; // no polling after lock
      // >3h: every 3h; 1-3h: every 30m; <1h: every 2m
      const twoMin = 2 * 60 * 1000;
      const halfHour = 30 * 60 * 1000;
      const threeHours = 3 * 60 * 60 * 1000;
      const freq = lockMs < 60 * 60 * 1000 ? twoMin : lockMs < 3 * 60 * 60 * 1000 ? halfHour : threeHours;
      interval = window.setInterval(loadSpreads, freq) as unknown as number;
    };
    schedule();

    // also reload when we cross the lock boundary
    const timeout = linesLockAt ? window.setTimeout(() => {
      loadSpreads();
      if (interval) window.clearInterval(interval);
    }, Math.max(0, +linesLockAt - Date.now())) as unknown as number : undefined;

    return () => {
      cancelled = true;
      if (interval) window.clearInterval(interval);
      if (timeout) window.clearTimeout(timeout);
    };
  }, [games, linesLockAt]);

  // canEdit is provided by useWeekPicks

  async function onSave() {
    if (!user || !leagueId) return;
    setErr(""); setMsg("");
    if (!canEdit) { setErr("Picks are locked."); return; }
    const selectedCountNow = games.reduce((acc, g) => acc + (sel[g.eventKey] ? 1 : 0), 0);
    const tbWinnerChosen = tiebreakerEventKey ? Boolean(sel[tiebreakerEventKey]) : false;
    if (tiebreakerEventKey && tbWinnerChosen && selectedCountNow === 6 && (tiebreaker === "" || Number.isNaN(Number(tiebreaker)))) {
      setErr("Enter a tiebreaker value.");
      return;
    }
    await save();
    setMsg(selectedCountNow === 6 ? "Saved!" : `Saved (${selectedCountNow}/6). You can finish later.`);
  }

  // spreads rendered inside GameCard

  if (!leagueId) return <div className="p-6">Select or create a league first.</div>;
  if (!user) return <div className="p-6">Please log in.</div>;

  const selectedCount = games.reduce((acc, g) => acc + (sel[g.eventKey] ? 1 : 0), 0);

  // Keyboard shortcuts: 1-6 to toggle selection for that game (away/home)
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!canEdit) return;
      const n = Number(e.key);
      if (n >= 1 && n <= 6) {
        const idx = n - 1;
        const g = games[idx];
        if (!g) return;
        const current = sel[g.eventKey];
        const next: "home" | "away" | undefined = current === "away" ? "home" : current === "home" ? undefined : "away";
        if (!next && selectedCount === 6) { return; }
        setSel((s) => {
          const c = { ...s };
          if (!next) delete c[g.eventKey]; else c[g.eventKey] = next;
          return c;
        });
        if (navigator.vibrate) navigator.vibrate(10);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [games, sel, canEdit, selectedCount, setSel]);

  return (
    <div className="max-w-3xl mx-auto space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Make Picks — {formatWeekLabel(weekId)}</h1>
        <div className="text-right">
          <div className="text-sm opacity-70">
            {linesLockAt ? `Lines lock: ${linesLockAt.toLocaleString()}` : "No lines lock set"}
            {linesLocked && <span className="ml-2 text-amber-700 font-medium">LINES LOCKED</span>}
          </div>
          <div className="text-xs opacity-70">
            {picksCloseAt ? `Picks close at kickoff: ${picksCloseAt.toLocaleString()}` : "Waiting for games"}
            {picksClosed && <span className="ml-2 text-red-600 font-medium">PICKS CLOSED</span>}
          </div>
          <div className="text-xs text-emerald-800">Selected: {selectedCount}/6</div>
        </div>
      </div>

      {linesLocked && !picksClosed && (
        <div className="card border-amber-300 bg-amber-50 text-amber-800">
          Lines are locked. You can still make picks until kickoff.
        </div>
      )}
      {picksClosed && (
        <div className="card border-red-300 bg-red-50 text-red-700">
          Picks are closed. Games have started.
        </div>
      )}

      {err && <div className="text-red-600">{err}</div>}
      {msg && <div className="text-green-600">{msg}</div>}

      <div className="grid gap-3">
        {games.map((g, i) => {
          const isTB = tiebreakerEventKey && g.eventKey === tiebreakerEventKey;
          const tbPick = isTB ? sel[g.eventKey] : undefined;
          const tbTeam = tbPick === "home" ? (g.home || "Home") : tbPick === "away" ? (g.away || "Away") : undefined;
          return (
            <div key={g.eventKey} className="relative space-y-2">
              {isTB && (
                <div className="absolute -top-2 -right-2 z-10 rounded-full bg-indigo-600 text-white text-[10px] px-2 py-0.5 shadow">Tiebreaker</div>
              )}
              <GameCard
                game={g as any}
                choice={sel[g.eventKey]}
                onChoose={(side) => {
                  if (!canEdit) return;
                  if (!sel[g.eventKey] && selectedCount === 6) {
                    setErr("Already picked 6. Deselect one first.");
                    return;
                  }
                  setSel((s) => ({ ...s, [g.eventKey]: side }));
                  if (err) setErr("");
                  if (navigator.vibrate) navigator.vibrate(8);
                }}
                canEdit={canEdit}
                spreads={spreads[g.eventKey]}
                index={i}
              />
              {isTB && tbPick && (
                <div className="rounded-lg border p-3 bg-white/60 dark:bg-slate-900/60">
                  <div className="flex items-center gap-3">
                    <div className="flex-1">
                      <label className="text-sm">{tbTeam ? `How much will ${tbTeam} win by?` : "How much will your tiebreaker pick win by?"}</label>
                      <div className="text-xs opacity-70">Enter a number (points). Required before saving.</div>
                    </div>
                    <input
                      type="number"
                      inputMode="numeric"
                      className="border rounded px-3 py-2 w-28 text-right"
                      placeholder="e.g. 7"
                      value={tiebreaker === "" ? "" : String(tiebreaker)}
                      onChange={(e)=>{
                        const v = e.target.value;
                        setTiebreaker(v === "" ? "" : Number(v));
                      }}
                      disabled={!canEdit || picksClosed}
                    />
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Tiebreaker input now lives under the tiebreaker game card */}

      {/* Tiebreaker modal removed */}

      <div className="flex gap-2">
        <button className="btn" disabled={!canEdit || saving} onClick={onSave}>
          {saving ? "Saving..." : "Save Picks"}
        </button>
        {!canEdit && <span className="text-sm opacity-70">Locked</span>}
      </div>

      {/* Sticky mobile footer CTA */}
      <div className="md:hidden fixed left-0 right-0 bottom-16 z-30">
        <div className="mx-auto max-w-3xl px-4">
          <div className="rounded-xl shadow-lg border bg-[var(--surface)] p-3 flex items-center gap-3">
            <div className="text-sm opacity-80">Selected {selectedCount}/6</div>
            {locked && <div className="text-sm text-red-600">Locked</div>}
            <button className="ml-auto btn btn-neon" disabled={!canEdit || saving || selectedCount!==6} onClick={onSave}>
              {saving ? "Saving..." : selectedCount===6 ? "Submit Picks" : "Pick 6"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
