// src/lib/oddsApi.ts
const BASE = "https://api.the-odds-api.com/v4";
const KEY = import.meta.env.VITE_ODDS_API_KEY as string;

// helper: format ISO without milliseconds
function isoNoMillis(d: Date) {
  return d.toISOString().replace(/\.\d{3}Z$/, "Z");
}

export async function listSpreadsNFL(opts?: { from?: Date; to?: Date }): Promise<EventSpread[]> {
  const params: Record<string, string> = {
    regions: "us",
    markets: "spreads",
    dateFormat: "iso",
  } as const;
  if (opts?.from) (params as any).commenceTimeFrom = isoNoMillis(opts.from);
  if (opts?.to) (params as any).commenceTimeTo = isoNoMillis(opts.to);

  type OddsEvent = {
    id: string;
    commence_time: string;
    home_team: string;
    away_team: string;
    bookmakers?: Array<{
      key: string;
      title: string;
      markets?: Array<{
        key: string; // "spreads"
        outcomes: Array<{ name: string; point?: number; price?: number }>;
      }>;
    }>;
  };

  const data = await req<OddsEvent[]>(`/sports/${NFL_KEY}/odds`, params);

  function pickBookmaker(ev: OddsEvent) {
    if (!ev.bookmakers?.length) return undefined;
    const prefer = ["draftkings", "fanduel", "williamhill_us", "betmgm"];
    const byKey: Record<string, any> = Object.fromEntries(ev.bookmakers.map((b) => [b.key, b]));
    for (const k of prefer) if (byKey[k]) return byKey[k];
    return ev.bookmakers[0];
  }

  return data.map((ev) => {
    const bm = pickBookmaker(ev);
    const market = bm?.markets?.find((m: { key: string; outcomes: Array<{ name: string; point?: number; price?: number }> }) => m.key === "spreads");
    const home = market?.outcomes.find((o: { name: string; point?: number; price?: number }) => o.name === ev.home_team);
    const away = market?.outcomes.find((o: { name: string; point?: number; price?: number }) => o.name === ev.away_team);
    return {
      id: ev.id,
      commence_time: ev.commence_time,
      home_team: ev.home_team,
      away_team: ev.away_team,
      home: home ? { name: home.name, point: home.point ?? null, price: home.price ?? null } : undefined,
      away: away ? { name: away.name, point: away.point ?? null, price: away.price ?? null } : undefined,
    } as EventSpread;
  });
}

export async function listScoresNFL(opts?: { daysFrom?: number; eventIds?: string[] }): Promise<ScoreEvent[]> {
  const params: Record<string, string> = { dateFormat: "iso" } as const;
  if (opts?.daysFrom != null) (params as any).daysFrom = String(opts.daysFrom);
  if (opts?.eventIds?.length) (params as any).eventIds = opts.eventIds.join(",");
  return req<ScoreEvent[]>(`/sports/${NFL_KEY}/scores`, params);
}

// Scores for events (live + completed within daysFrom). Only live/completed have scores.
export type ScoreEvent = {
  id: string;
  sport_key?: string;
  commence_time: string;
  completed?: boolean;
  scores?: Array<{ name: string; score: number }>;
  last_update?: string;
};

export async function listScoresNCAAF(opts?: { daysFrom?: number; eventIds?: string[] }): Promise<ScoreEvent[]> {
  const params: Record<string, string | string[]> = { dateFormat: "iso" } as const;
  if (opts?.daysFrom != null) (params as any).daysFrom = String(opts.daysFrom);
  if (opts?.eventIds?.length) {
    const cleaned = opts.eventIds.map(id => String(id).trim()).map(id => id.includes(":") ? id.split(":")[0] : id).filter(Boolean);
    (params as any).eventIds = cleaned; // append each id as its own param
  }
  return req<ScoreEvent[]>(`/sports/${NCAAF_KEY}/scores`, params);
}

export async function listScoresBySportKey(sportKey: string, opts?: { daysFrom?: number; eventIds?: string[] }): Promise<ScoreEvent[]> {
  const params: Record<string, string | string[]> = { dateFormat: "iso" } as const;
  if (opts?.daysFrom != null) (params as any).daysFrom = String(opts.daysFrom);
  if (opts?.eventIds?.length) {
    const cleaned = opts.eventIds.map(id => String(id).trim()).map(id => id.includes(":") ? id.split(":")[0] : id).filter(Boolean);
    (params as any).eventIds = cleaned; // append each id as its own param
  }
  return req<ScoreEvent[]>(`/sports/${sportKey}/scores`, params);
}

async function req<T>(path: string, params: Record<string, string | number | boolean | string[]> = {}): Promise<T> {
  if (!KEY) throw new Error("Missing VITE_ODDS_API_KEY");
  const usp = new URLSearchParams();
  usp.append("apiKey", KEY);
  for (const [k, v] of Object.entries(params)) {
    if (Array.isArray(v)) {
      for (const item of v) usp.append(k, item);
    } else {
      usp.append(k, String(v));
    }
  }
  const url = `${BASE}${path}?${usp.toString()}`;
  const res = await fetch(url);
  if (!res.ok) {
    // Soft-retry logic for 422 with eventIds/daysFrom combinations
    if (res.status === 422) {
      const hasEventIds = 'eventIds' in params && Array.isArray((params as any).eventIds) && (params as any).eventIds.length > 0;
      const hasDaysFrom = 'daysFrom' in params;
      // If both provided, retry without daysFrom
      if (hasEventIds && hasDaysFrom) {
        const usp2 = new URLSearchParams();
        usp2.append('apiKey', KEY);
        usp2.append('dateFormat', 'iso');
        for (const id of (params as any).eventIds as string[]) usp2.append('eventIds', id);
        const res2 = await fetch(`${BASE}${path}?${usp2.toString()}`);
        if (res2.ok) return res2.json() as Promise<T>;
      }
      // If date range keys present, try minimal query
      if ("commenceTimeFrom" in params || "commenceTimeTo" in params) {
        const url2 = `${BASE}${path}?${new URLSearchParams({ apiKey: KEY }).toString()}`;
        const res2 = await fetch(url2);
        if (res2.ok) return res2.json() as Promise<T>;
      }
    }
    throw new Error(`${res.status} ${res.statusText}`);
  }
  return res.json() as Promise<T>;
}

// We’ll still export listSports in case you need it elsewhere
export async function listSports() {
  return req<Array<{ key: string; title: string; group: string; active: boolean }>>("/sports/");
}

// Always use NCAAF for your seeding
export const NCAAF_KEY = "americanfootball_ncaaf";
export const NFL_KEY = "americanfootball_nfl";
export const NFL_PRE_KEY = "americanfootball_nfl_preseason";

// Events (optionally filter by a FROM time)
export async function listEventsNCAAF(opts?: { from?: Date; to?: Date }) {
  const params: any = {};
  if (opts?.from) params.commenceTimeFrom = isoNoMillis(opts.from); // e.g. 2025-08-14T06:43:44Z
  if (opts?.to) params.commenceTimeTo = isoNoMillis(opts.to);
  return req<Array<{ id: string; sport_key: string; sport_title: string; commence_time: string; home_team: string; away_team: string }>>(
    `/sports/${NCAAF_KEY}/events`,
    params
  );
}

export async function listEventsNFL(opts?: { from?: Date; to?: Date }) {
  const params: any = {};
  if (opts?.from) params.commenceTimeFrom = isoNoMillis(opts.from);
  if (opts?.to) params.commenceTimeTo = isoNoMillis(opts.to);
  return req<Array<{ id: string; sport_key: string; sport_title: string; commence_time: string; home_team: string; away_team: string }>>(
    `/sports/${NFL_KEY}/events`,
    params
  );
}

// Generic: fetch events for any sport key (e.g., americanfootball_nfl_preseason)
export async function listEventsBySportKey(sportKey: string, opts?: { from?: Date; to?: Date }) {
  const params: any = {};
  if (opts?.from) params.commenceTimeFrom = isoNoMillis(opts.from);
  if (opts?.to) params.commenceTimeTo = isoNoMillis(opts.to);
  return req<Array<{ id: string; sport_key: string; sport_title: string; commence_time: string; home_team: string; away_team: string }>>(
    `/sports/${sportKey}/events`,
    params
  );
}

// Spreads for events within a time window (simplified structure)
export type SpreadOutcome = { name: string; point: number | null; price: number | null };
export type EventSpread = {
  id: string;
  commence_time: string;
  home_team: string;
  away_team: string;
  home?: SpreadOutcome;
  away?: SpreadOutcome;
};

export async function listSpreadsNCAAF(opts?: { from?: Date; to?: Date }): Promise<EventSpread[]> {
  const params: Record<string, string> = {
    regions: "us",
    markets: "spreads",
    dateFormat: "iso",
  } as const;
  if (opts?.from) (params as any).commenceTimeFrom = isoNoMillis(opts.from);
  if (opts?.to) (params as any).commenceTimeTo = isoNoMillis(opts.to);

  type OddsEvent = {
    id: string;
    commence_time: string;
    home_team: string;
    away_team: string;
    bookmakers?: Array<{
      key: string;
      title: string;
      markets?: Array<{
        key: string; // "spreads"
        outcomes: Array<{ name: string; point?: number; price?: number }>;
      }>;
    }>;
  };

  const data = await req<OddsEvent[]>(`/sports/${NCAAF_KEY}/odds`, params);

  function pickBookmaker(ev: OddsEvent) {
    if (!ev.bookmakers?.length) return undefined;
    const prefer = ["draftkings", "fanduel", "williamhill_us", "betmgm"];
    const byKey: Record<string, any> = Object.fromEntries(ev.bookmakers.map((b) => [b.key, b]));
    for (const k of prefer) if (byKey[k]) return byKey[k];
    return ev.bookmakers[0];
  }

  return data.map((ev) => {
    const bm = pickBookmaker(ev);
    const market = bm?.markets?.find((m: { key: string; outcomes: Array<{ name: string; point?: number; price?: number }> }) => m.key === "spreads");
    const home = market?.outcomes.find((o: { name: string; point?: number; price?: number }) => o.name === ev.home_team);
    const away = market?.outcomes.find((o: { name: string; point?: number; price?: number }) => o.name === ev.away_team);
    return {
      id: ev.id,
      commence_time: ev.commence_time,
      home_team: ev.home_team,
      away_team: ev.away_team,
      home: home ? { name: home.name, point: home.point ?? null, price: home.price ?? null } : undefined,
      away: away ? { name: away.name, point: away.point ?? null, price: away.price ?? null } : undefined,
    } as EventSpread;
  });
}
