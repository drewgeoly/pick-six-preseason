import { useEffect, useState } from "react";
import { listEvents } from "../lib/sportsApi";
import { useLatestOdds } from "../hooks/useLatestOdds";

export default function OddsBoard() {
  const COMP_KEY = import.meta.env.VITE_CFB_COMPETITION_KEY as string; // or NBA, etc.
  const [events, setEvents] = useState<{ key: string; name: string; startTime: string }[]>([]);
  const [selected, setSelected] = useState<string[]>([]);

  useEffect(() => {
    (async () => {
      const { events } = await listEvents(COMP_KEY);
      // pick first 6 upcoming just to demo:
      const upcoming = events.sort((a,b)=>+new Date(a.startTime)-+new Date(b.startTime)).slice(0,6);
      setEvents(upcoming);
      setSelected(upcoming.map(e => e.key));
    })();
  }, [COMP_KEY]);

  const { data, loading, err } = useLatestOdds(selected, { type: "MONEYLINE", segment: "FULL_MATCH", sources: ["DRAFT_KINGS","FANDUEL","CAESARS"] });

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <h1 className="text-2xl font-semibold mb-3">Latest Odds</h1>
      {loading && <div>Loading…</div>}
      {err && <div className="text-red-600">{err}</div>}

      <div className="space-y-3">
        {events.map(ev => (
          <div key={ev.key} className="card">
            <div className="flex items-center justify-between">
              <div>
                <div className="font-medium">{ev.name}</div>
                <div className="text-sm text-gray-600">{new Date(ev.startTime).toLocaleString()}</div>
              </div>
              <label className="text-sm flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={selected.includes(ev.key)}
                  onChange={(e) => {
                    setSelected(s => e.target.checked ? [...new Set([...s, ev.key])] : s.filter(k => k !== ev.key));
                  }}
                />
                include
              </label>
            </div>

            <table className="w-full text-sm mt-3 border-t">
              <thead>
                <tr className="text-left">
                  <th className="py-2">Sportsbook</th>
                  <th>Side</th>
                  <th>Decimal</th>
                </tr>
              </thead>
              <tbody>
                {data.filter(r => r.eventKey === ev.key).map((r, i) => (
                  <tr key={i} className="border-t">
                    <td className="py-2">{r.sportsbook}</td>
                    <td>{r.side}</td>
                    <td>{r.payoutDecimal}</td>
                  </tr>
                ))}
              </tbody>
            </table>

          </div>
        ))}
      </div>
    </div>
  );
}
