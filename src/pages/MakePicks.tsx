// src/pages/MakePicks.tsx
import { useEffect, useMemo, useState } from "react";
import { collection, doc, getDoc, onSnapshot, serverTimestamp, setDoc } from "firebase/firestore";
import { db } from "../lib/firebase";
import { useAuth } from "../auth/AuthProvider";
import { useLeague } from "../league/LeagueProvider";
import { useParams } from "react-router-dom";
import { listSpreadsNCAAF } from "../lib/oddsApi";
import { isPickCorrect, type GameDoc, type PickVerdict } from "../lib/scoring";
import type { EventSpread } from "../lib/oddsApi";

type Game = { eventKey: string; name: string; startTime: string; home?: string; away?: string } & Partial<GameDoc>;

export default function MakePicks() {
  const { user } = useAuth();
  const { leagueId } = useLeague();
  const { weekId = "2025-W01" } = useParams();
  const [games, setGames] = useState<Game[]>([]);
  const [deadline, setDeadline] = useState<Date | null>(null);
  const [locked, setLocked] = useState(false);
  const [sel, setSel] = useState<Record<string, "home" | "away">>({});
  const [tiebreaker, setTiebreaker] = useState<number | "">("");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const [spreads, setSpreads] = useState<Record<string, { home?: { point: number | null; price: number | null }; away?: { point: number | null; price: number | null } }>>({});

  useEffect(() => {
    if (!leagueId) return;
    const wref = doc(db, "leagues", leagueId, "weeks", weekId);
    (async () => {
      const ws = await getDoc(wref);
      const w = ws.data();
      setDeadline(w?.deadline?.toDate ? w.deadline.toDate() : (w?.deadline ? new Date(w.deadline) : null));
      setLocked(Boolean(w?.locked));
    })();

    // Live games listener
    const unsubGames = onSnapshot(collection(wref, "games"), (snap) => {
      const allGames = snap.docs.map((d) => {
        const data = d.data() as any;
        const updatedAt: Date = data.updatedAt?.toDate ? data.updatedAt.toDate() : (data.updatedAt ? new Date(data.updatedAt) : new Date(0));
        const startTime = data.startTime;
        return { eventKey: d.id, ...data, updatedAt, startTime } as Game & { updatedAt?: Date };
      });
      const latestSix = allGames
        .sort((a, b) => +((b as any).updatedAt || 0) - +((a as any).updatedAt || 0))
        .slice(0, 6)
        .sort((a, b) => +new Date(a.startTime) - +new Date(b.startTime));
      setGames(latestSix);
      // Fetch spreads window when games change
      if (latestSix.length) {
        const minStart = new Date(Math.min(...latestSix.map(g => +new Date(g.startTime))));
        const maxStart = new Date(Math.max(...latestSix.map(g => +new Date(g.startTime))));
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
      }
    });

    // User picks
    let unsubPicks: undefined | (() => void);
    if (user) {
      unsubPicks = onSnapshot(doc(db, "leagues", leagueId, "weeks", weekId, "userPicks", user.uid), (ps) => {
        const p = ps.data() as any;
        if (p) {
          setSel(p.selections || {});
          setTiebreaker(typeof p.tiebreaker === "number" ? p.tiebreaker : "");
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

  async function save() {
    if (!user || !leagueId) return;
    if (!canEdit) return alert("Picks are locked.");
    if (Object.keys(sel).length !== 6) return alert("Pick exactly 6 games.");
    setSaving(true);
    setMsg("");
    await setDoc(doc(db, "leagues", leagueId, "weeks", weekId, "userPicks", user.uid), {
      selections: sel,
      tiebreaker: tiebreaker === "" ? null : Number(tiebreaker),
      updatedAt: serverTimestamp(),
    }, { merge: true });
    setSaving(false);
    setMsg("Saved!");
  }

  function formatSpread(point: number | null | undefined, price: number | null | undefined) {
    if (point == null && price == null) return "";
    const p = point != null ? (point > 0 ? `+${point}` : `${point}`) : "";
    const pr = price != null ? (price > 0 ? ` (+${price})` : ` (${price})`) : "";
    return `${p}${pr}`.trim();
  }

  function verdictClass(v: PickVerdict, selected: boolean) {
    if (!selected) return "";
    if (v === "correct") return "ring-2 ring-emerald-600 bg-emerald-50";
    if (v === "incorrect") return "ring-2 ring-red-600 bg-red-50";
    if (v === "tie") return "ring-2 ring-gray-500 bg-gray-50";
    return ""; // pending
  }

  if (!leagueId) return <div className="p-6">Select or create a league first.</div>;
  if (!user) return <div className="p-6">Please log in.</div>;

  return (
    <div className="max-w-3xl mx-auto space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Make Picks — {weekId}</h1>
        <div className="text-right">
          <div className="text-sm opacity-70">
            {deadline ? `Locks: ${deadline.toLocaleString()}` : "No deadline set"}
            {locked && <span className="ml-2 text-red-600 font-medium">LOCKED</span>}
          </div>
          <div className="text-xs text-emerald-800">Selected: {Object.keys(sel).length}/6</div>
        </div>
      </div>

      {msg && <div className="text-green-600">{msg}</div>}

      <div className="grid gap-3">
        {games.map((g, i) => {
          const choice = sel[g.eventKey];
          const v = isPickCorrect(choice, g);
          return (
            <div key={g.eventKey} className="card">
              <div className="flex items-center justify-between">
                <div className="font-medium">{g.name}</div>
                <div className="text-xs opacity-60">{new Date(g.startTime).toLocaleString()}</div>
              </div>
              <div className="mt-2 flex gap-2 items-center">
                <button
                  disabled={!canEdit}
                  className={`pick-btn ${choice === "home" ? "pick-selected" : choice === "away" ? "pick-dim" : ""} ${verdictClass(v, choice === "home")}`}
                  onClick={() => setSel((s) => ({ ...s, [g.eventKey]: "home" }))}
                  aria-pressed={choice === "home"}
                >
                  <div className="flex flex-col items-start">
                    <span>{g.home || "Home"}</span>
                    <span className="text-[11px] opacity-80">{formatSpread(spreads[g.eventKey]?.home?.point, spreads[g.eventKey]?.home?.price)}</span>
                    {g.decided && choice === "home" && (
                      <span className="text-[11px] font-medium">{g.finalScoreHome ?? ""}–{g.finalScoreAway ?? ""}</span>
                    )}
                  </div>
                </button>
                <button
                  disabled={!canEdit}
                  className={`pick-btn ${choice === "away" ? "pick-selected" : choice === "home" ? "pick-dim" : ""} ${verdictClass(v, choice === "away")}`}
                  onClick={() => setSel((s) => ({ ...s, [g.eventKey]: "away" }))}
                  aria-pressed={choice === "away"}
                >
                  <div className="flex flex-col items-start">
                    <span>{g.away || "Away"}</span>
                    <span className="text-[11px] opacity-80">{formatSpread(spreads[g.eventKey]?.away?.point, spreads[g.eventKey]?.away?.price)}</span>
                    {g.decided && choice === "away" && (
                      <span className="text-[11px] font-medium">{g.finalScoreAway ?? ""}–{g.finalScoreHome ?? ""}</span>
                    )}
                  </div>
                </button>
                <span className="ml-auto text-xs opacity-60">Game {i + 1}</span>
              </div>
            </div>
          );
        })}
      </div>

      <div className="card">
        <label className="text-sm">Tiebreaker prediction (point differential: home - away)</label>
        <input
          type="number"
          className="border rounded px-2 py-1 mt-1"
          value={tiebreaker}
          onChange={(e)=>setTiebreaker(e.target.value === "" ? "" : Number(e.target.value))}
          disabled={!canEdit}
        />
        <div className="text-xs opacity-70 mt-1">Admin selects the tiebreaker game on the results page.</div>
      </div>

      <div className="flex gap-2">
        <button className="btn" disabled={!canEdit || saving} onClick={save}>
          {saving ? "Saving..." : "Save Picks"}
        </button>
        {!canEdit && <span className="text-sm opacity-70">Locked</span>}
      </div>
    </div>
  );
}
