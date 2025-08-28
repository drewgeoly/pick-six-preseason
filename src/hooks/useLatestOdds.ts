// src/hooks/useLatestOdds.ts
import { useEffect, useState } from "react";
import { getEventsWithMarkets, extractMarket } from "../lib/sportsApi";

export function useLatestOdds(eventKeys: string[], opts?: { type?: string; segment?: string; sources?: string[] }) {
  const [data, setData] = useState<{ eventKey:string; sportsbook:string; side:string; payoutDecimal:number }[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string>("");

  useEffect(() => {
    if (!eventKeys.length) return;
    (async () => {
      setLoading(true); setErr("");
      try {
        const { events } = await getEventsWithMarkets(eventKeys.slice(0,50));
        const rows: any[] = [];
        for (const ev of events) {
          const m = extractMarket(ev, { type: opts?.type, segment: opts?.segment });
          if (!m?.outcomes) continue;
          for (const [book, outs] of Object.entries(m.outcomes)) {
            if (opts?.sources && !opts.sources.includes(book)) continue;
            for (const o of outs) {
              if (o.type !== "WIN") continue;
              rows.push({ eventKey: ev.key, sportsbook: book, side: o.participant?.shortName || o.participant?.name || o.type, payoutDecimal: o.payout });
            }
          }
        }
        setData(rows);
      } catch (e:any) { setErr(e.message || "Failed to load odds"); }
      finally { setLoading(false); }
    })();
  }, [JSON.stringify(eventKeys), opts?.type, opts?.segment, JSON.stringify(opts?.sources)]);

  return { data, loading, err };
}
