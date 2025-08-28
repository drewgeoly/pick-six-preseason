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
import TiebreakerModal from "../components/TiebreakerModal";

// (types covered by hook and GameCard)

export default function MakePicks() {
  const { leagueId } = useLeague();
  const { weekId = FALLBACK_WEEK_ID } = useParams();
  const { user, games, deadline, locked, canEdit, sel, setSel, tiebreaker, setTiebreaker, saving, save } = useWeekPicks(leagueId, weekId);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [spreads, setSpreads] = useState<Record<string, { home?: { point: number | null; price: number | null }; away?: { point: number | null; price: number | null } }>>({});
  const [tbOpen, setTbOpen] = useState(false);

  useEffect(() => {
    if (leagueId && weekId) rememberLastWeekId(leagueId, weekId);
  }, [leagueId, weekId]);

  useEffect(() => {
    if (!games.length) return;
    const minStart = new Date(Math.min(...games.map(g => +new Date(g.startTime))));
    const maxStart = new Date(Math.max(...games.map(g => +new Date(g.startTime))));
    const from = new Date(minStart.getTime() - 24 * 60 * 60 * 1000);
    const to = new Date(maxStart.getTime() + 24 * 60 * 60 * 1000);
    listSpreadsNCAAF({ from, to }).then((odds)=>{
      const map: Record<string, any> = {};
      odds.forEach((ev: EventSpread) => {
        map[ev.id] = {
          home: ev.home ? { point: ev.home.point ?? null, price: ev.home.price ?? null } : undefined,
          away: ev.away ? { point: ev.away.point ?? null, price: ev.away.price ?? null } : undefined,
        };
      });
      setSpreads(map);
    }).catch(()=>{/* ignore */});
  }, [games]);

  // canEdit is provided by useWeekPicks

  async function onSave() {
    if (!user || !leagueId) return;
    setErr(""); setMsg("");
    if (!canEdit) { setErr("Picks are locked."); return; }
    if (Object.keys(sel).length !== 6) { setErr("Pick exactly 6 games."); return; }
    await save();
    setMsg("Saved!");
  }

  // spreads rendered inside GameCard

  if (!leagueId) return <div className="p-6">Select or create a league first.</div>;
  if (!user) return <div className="p-6">Please log in.</div>;

  const selectedCount = Object.keys(sel).length;
  const canChooseMore = canEdit && selectedCount < 6;

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
            {deadline ? `Locks: ${deadline.toLocaleString()}` : "No deadline set"}
            {locked && <span className="ml-2 text-red-600 font-medium">LOCKED</span>}
          </div>
          <div className="text-xs text-emerald-800">Selected: {selectedCount}/6</div>
        </div>
      </div>

      {err && <div className="text-red-600">{err}</div>}
      {msg && <div className="text-green-600">{msg}</div>}

      <div className="grid gap-3">
        {games.map((g, i) => (
          <GameCard
            key={g.eventKey}
            game={g as any}
            choice={sel[g.eventKey]}
            onChoose={(side) => {
              if (!canEdit) return;
              if (!sel[g.eventKey] && !canChooseMore) return; // cap 6
              setSel((s) => ({ ...s, [g.eventKey]: side }));
              if (navigator.vibrate) navigator.vibrate(8);
            }}
            canEdit={canEdit && (!!sel[g.eventKey] || canChooseMore)}
            spreads={spreads[g.eventKey]}
            index={i}
          />
        ))}
      </div>

      <div className="card">
        <div className="flex items-center justify-between">
          <div>
            <label className="text-sm">Tiebreaker prediction (home − away)</label>
            <div className="text-xs opacity-70">Admin selects the tiebreaker game on the results page.</div>
          </div>
          <button className="btn btn-neon" disabled={!canEdit} onClick={()=>setTbOpen(true)}>Set</button>
        </div>
        <div className="mt-2 text-sm opacity-80">Current: {tiebreaker === "" ? "—" : tiebreaker}</div>
      </div>

      <TiebreakerModal open={tbOpen} value={tiebreaker} onChange={setTiebreaker} onClose={()=>setTbOpen(false)} />

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
