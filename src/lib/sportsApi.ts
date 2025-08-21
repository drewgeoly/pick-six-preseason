const BASE = "https://sportsbook-api2.p.rapidapi.com";
const KEY  = import.meta.env.VITE_RAPIDAPI_KEY as string;
const HOST = import.meta.env.VITE_RAPIDAPI_HOST as string;

type Event = {
  key: string;
  name: string;
  startTime: string;            // ISO
  homeParticipantKey?: string;
  participants?: { key: string; name: string; shortName?: string }[];
  markets?: Market[];
};
type Market = {
  key: string;
  type: "MONEYLINE" | "MONEYLINE_3WAY" | "POINT_TOTAL" | "POINT_SPREAD" | string;
  segment?: "FULL_MATCH" | "REGULATION_TIME" | "HALF_1" | string;
  outcomes?: Record<string, Outcome[]>; // grouped by sportsbook (e.g., "DRAFT_KINGS": Outcome[])
};
type Outcome = {
  key: string;
  type: "WIN" | "OVER" | "UNDER" | "DRAW" | "YES" | "NO";
  modifier: number;  // spread number or total; 0 for moneyline
  payout: number;    // decimal odds (e.g., 1.91)
  live: boolean;
  source: string;    // sportsbook name
  participant?: { key: string; name: string; shortName?: string };
};

async function req<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: {
      "X-RapidAPI-Key": KEY,
      "X-RapidAPI-Host": HOST,
    },
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json() as Promise<T>;
}

// 1) Get all competitions once; cache the key you need
export async function listCompetitions() {
  return req<{ competitions: { key: string; name: string; sport: string }[] }>(`/v0/competitions`);
}

// 2) List events (games) for a competition (e.g., NCAA Football / NBA)
export async function listEvents(competitionKey: string) {
  return req<{ events: Event[] }>(`/v0/competitions/${competitionKey}/events`);
}

// 3) Get latest odds for up to 50 events at a time
export async function getEventsWithMarkets(eventKeys: string[]) {
  const qs = eventKeys.map(k => `eventKeys=${encodeURIComponent(k)}`).join("&");
  return req<{ events: Event[] }>(`/v0/events?${qs}`);
}

// 4) Convenience: pull a single market (e.g., MONEYLINE FULL_MATCH) from events payload
export function extractMarket(
  ev: Event,
  options: { type?: string; segment?: string } = {}
) {
  const { type = "MONEYLINE", segment = "FULL_MATCH" } = options;
  return ev.markets?.find(m => m.type === type && (segment ? m.segment === segment : true));
}

// 5) Convert decimal odds → American (optional)
export function decimalToAmerican(payout: number): number {
  // payout is decimal: 1.91, 2.25, etc.
  if (payout >= 2) return Math.round((payout - 1) * 100);
  return Math.round(-100 / (payout - 1));
}

export async function getCompetitionEvents(competitionKey: string) {
    const { events } = await listEvents(competitionKey); // returns { events: [...] }
    return events; // keep AdminSelectGames usage the same
  }