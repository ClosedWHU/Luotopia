/**
 * Shared UptimeRobot helpers for the status page.
 *
 * Deliberately runtime-agnostic: everything here is plain `fetch` + `Intl`, so
 * the exact same code path runs in a Pages Function (see
 * `functions/api/status.ts`) and in the `astro dev` middleware that
 * `astro.config.mjs` installs. Cloudflare-only APIs (`caches.default`,
 * `cf.cacheTtl`) live in the caller, never here — `caches` does not exist in
 * Node, and touching it at import time would take the dev server down with it.
 *
 * UptimeRobot is a POST API, which is why there is no `cf: { cacheTtl }` on
 * the upstream request: Cloudflare only edge-caches GET/HEAD. Caching the
 * derived snapshot is the caller's job.
 */

/* ── Configuration ─────────────────────────────────────────────────── */

export interface StatusEnv {
  UPTIMEROBOT_API_KEY?: string;
  UPTIMEROBOT_API_URL?: string;
  /** Days of history to request. Clamped to 1..MAX_DAYS. */
  STATUS_COUNT_DAYS?: string;
  /** Publish each monitor's URL to the page. Default on. */
  STATUS_SHOW_LINKS?: string;
  /** IANA zone the day buckets are cut in. Default Asia/Shanghai. */
  STATUS_TIME_ZONE?: string;
  /** Seconds the derived snapshot stays fresh. Default 300. */
  STATUS_CACHE_TTL?: string;
}

export interface StatusOptions {
  apiKey: string;
  apiUrl: string;
  days: number;
  showLinks: boolean;
  timeZone: string;
  cacheTtl: number;
}

export const DEFAULT_API_URL = "https://api.uptimerobot.com/v2/";
export const DEFAULT_DAYS = 90;
export const MAX_DAYS = 180;
export const DEFAULT_TIME_ZONE = "Asia/Shanghai";
export const DEFAULT_CACHE_TTL = 300;

const FALSEY = new Set(["0", "false", "no", "off", ""]);

function positiveInt(value: string | undefined, fallback: number, max: number): number {
  const n = Number.parseInt(value ?? "", 10);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(max, n);
}

/**
 * Options come from the environment only.
 *
 * `days` is *not* read from the query string, on purpose: it is part of the
 * upstream request and of the cache key, so letting a caller pick it would
 * hand out unbounded cache-miss amplification against an API with a hard rate
 * limit. The page's 30/90-day switch slices the one snapshot client-side.
 */
export function resolveStatusOptions(env: StatusEnv = {}): StatusOptions {
  return {
    apiKey: (env.UPTIMEROBOT_API_KEY || "").trim(),
    apiUrl: (env.UPTIMEROBOT_API_URL || DEFAULT_API_URL).trim(),
    days: positiveInt(env.STATUS_COUNT_DAYS, DEFAULT_DAYS, MAX_DAYS),
    showLinks: !FALSEY.has((env.STATUS_SHOW_LINKS ?? "1").trim().toLowerCase()),
    timeZone: (env.STATUS_TIME_ZONE || DEFAULT_TIME_ZONE).trim(),
    cacheTtl: positiveInt(env.STATUS_CACHE_TTL, DEFAULT_CACHE_TTL, 3600),
  };
}

/* ── Time zone maths ───────────────────────────────────────────────── */

/*
 * Day buckets are cut in the audience's zone, not the runtime's.
 *
 * Workers run in UTC, and the previous implementation of this page bucketed by
 * `dayjs()` on the server and formatted with the browser's local zone on the
 * client — so for a UTC+8 reader every "day" column was actually 08:00→08:00,
 * and the tooltip date disagreed with the bar it described. `Intl` is
 * available in both Workers and Node, so the zone is now explicit and shipped
 * to the client in the payload for it to format with.
 */

interface ZoneParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

const zoneFormatters = new Map<string, Intl.DateTimeFormat>();

function zoneFormatter(timeZone: string): Intl.DateTimeFormat {
  let formatter = zoneFormatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-US", {
      timeZone,
      // `hourCycle`, not `hour12: false`: some ICU builds answer h23 requests
      // with "24" for midnight under the latter, which then rolls the date.
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    zoneFormatters.set(timeZone, formatter);
  }
  return formatter;
}

function zoneParts(tsMs: number, timeZone: string): ZoneParts {
  const parts: ZoneParts = { year: 1970, month: 1, day: 1, hour: 0, minute: 0, second: 0 };
  for (const part of zoneFormatter(timeZone).formatToParts(new Date(tsMs))) {
    const value = Number(part.value);
    if (part.type === "year") parts.year = value;
    else if (part.type === "month") parts.month = value;
    else if (part.type === "day") parts.day = value;
    else if (part.type === "hour") parts.hour = value % 24;
    else if (part.type === "minute") parts.minute = value;
    else if (part.type === "second") parts.second = value;
  }
  return parts;
}

/** Seconds to add to a UTC instant to get the zone's wall clock. */
function zoneOffsetSeconds(tsMs: number, timeZone: string): number {
  const p = zoneParts(tsMs, timeZone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return Math.round((asUtc - Math.floor(tsMs / 1000) * 1000) / 1000);
}

/** Unix seconds of 00:00:00 in `timeZone` for the day containing `tsMs`. */
export function startOfDaySeconds(tsMs: number, timeZone: string): number {
  const p = zoneParts(tsMs, timeZone);
  const wallMidnight = Date.UTC(p.year, p.month - 1, p.day, 0, 0, 0);
  const guess = wallMidnight - zoneOffsetSeconds(wallMidnight, timeZone) * 1000;
  // Second pass: the offset at the guess can differ from the offset at
  // wall-midnight when a DST transition falls inside the day.
  return Math.round((wallMidnight - zoneOffsetSeconds(guess, timeZone) * 1000) / 1000);
}

/**
 * Day starts covering the last `days` days, newest first.
 *
 * Steps backwards by an hour rather than by 86400s so a DST shift cannot land
 * the cursor back inside the day it just left.
 */
export function dayWindow(nowMs: number, days: number, timeZone: string): number[] {
  const starts: number[] = [];
  let cursor = startOfDaySeconds(nowMs, timeZone);
  for (let i = 0; i < days; i++) {
    starts.push(cursor);
    cursor = startOfDaySeconds((cursor - 3600) * 1000, timeZone);
  }
  return starts;
}

export interface RangeWindow {
  /** `custom_uptime_ranges` value: one `start_end` pair per day plus the total. */
  ranges: string;
  /** `logs_start_date` / `logs_end_date` bounds, unix seconds. */
  start: number;
  end: number;
}

/**
 * Day ends, parallel to `starts` and in the same descending order.
 *
 * `starts` descends, so the end of day i is simply the start of day i-1. Today
 * has no successor in the array and gets its own midnight lookup.
 */
export function dayEnds(starts: number[], timeZone: string): number[] {
  const tomorrow = startOfDaySeconds((starts[0] + 86400) * 1000, timeZone);
  return starts.map((_, i) => (i === 0 ? tomorrow : starts[i - 1]));
}

/** Builds the per-day ranges plus the whole-window range UptimeRobot appends. */
export function buildRanges(starts: number[], timeZone: string): RangeWindow {
  const ends = dayEnds(starts, timeZone);
  const parts = starts.map((s, i) => `${s}_${ends[i]}`);
  const oldest = starts[starts.length - 1];
  parts.push(`${oldest}_${ends[0]}`);
  return { ranges: parts.join("-"), start: oldest, end: ends[0] };
}

/* ── UptimeRobot wire format ───────────────────────────────────────── */

export interface UptimeRobotLog {
  id?: number;
  /** 1 = went down, 2 = came back up, 99 = "still down" reminder. */
  type?: number;
  /** Unix seconds of the transition. */
  datetime?: number;
  /**
   * Seconds spent in the state this log opens. Verified against the live API:
   * on a type-1 (down) log it is the length of the outage — 0 while the outage
   * is still running — and on a type-2 (up) log it is the length of the uptime
   * spell that follows. Only the former is summed here; counting both would
   * double every incident.
   */
  duration?: number;
  reason?: { code?: number; detail?: string } | string;
}

export interface UptimeRobotMonitor {
  id: number;
  friendly_name?: string;
  url?: string;
  /** 1 HTTP(s) · 2 keyword · 3 ping · 4 port · 5 heartbeat · 6-8 mail. */
  type?: number;
  sub_type?: string;
  port?: number;
  /** 0 paused · 1 not checked yet · 2 up · 8 seems down · 9 down. */
  status?: number;
  interval?: number;
  logs?: UptimeRobotLog[];
  /** Dash-separated percentages, one per requested range, total last. */
  custom_uptime_ranges?: string;
}

export interface UptimeRobotResponse {
  stat?: string;
  error?: { type?: number; message?: string };
  monitors?: UptimeRobotMonitor[];
  pagination?: { offset?: number; limit?: number; total?: number };
}

export class StatusUpstreamError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(code: string, message: string, status = 502) {
    super(message);
    this.name = "StatusUpstreamError";
    this.code = code;
    this.status = status;
  }
}

function joinUrl(base: string, path: string): string {
  return `${base.endsWith("/") ? base : `${base}/`}${path}`;
}

async function requestMonitors(
  options: StatusOptions,
  window: RangeWindow,
  offset: number,
): Promise<UptimeRobotResponse> {
  const body = new URLSearchParams({
    api_key: options.apiKey,
    format: "json",
    logs: "1",
    // 1 = down, 2 = up. Everything else (pause/resume reminders) is noise for
    // an availability chart and only inflates the log payload.
    log_types: "1-2",
    logs_start_date: String(window.start),
    logs_end_date: String(window.end),
    custom_uptime_ranges: window.ranges,
    offset: String(offset),
  });

  let response: Response;
  try {
    response = await fetch(joinUrl(options.apiUrl, "getMonitors"), {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });
  } catch (e) {
    throw new StatusUpstreamError(
      "upstream_unreachable",
      `Cannot reach UptimeRobot: ${e instanceof Error ? e.message : String(e)}`,
      502,
    );
  }

  if (!response.ok) {
    throw new StatusUpstreamError("upstream_status", `UptimeRobot responded ${response.status}`, 502);
  }

  const payload = (await response.json()) as UptimeRobotResponse;
  if (payload.stat !== "ok") {
    // An invalid key answers 200 with stat:"fail", so this is the only place
    // the misconfiguration surfaces.
    throw new StatusUpstreamError(
      "upstream_error",
      payload.error?.message || "UptimeRobot returned an error",
      502,
    );
  }
  return payload;
}

/**
 * Every monitor, following UptimeRobot's pagination.
 *
 * The default page size is 50; without this the list would silently truncate
 * and the summary would report a healthy site built from a fraction of it.
 */
export async function fetchAllMonitors(
  options: StatusOptions,
  window: RangeWindow,
): Promise<UptimeRobotMonitor[]> {
  const monitors: UptimeRobotMonitor[] = [];
  let offset = 0;
  for (let page = 0; page < 20; page++) {
    const payload = await requestMonitors(options, window, offset);
    const batch = payload.monitors ?? [];
    monitors.push(...batch);
    const total = payload.pagination?.total ?? monitors.length;
    offset += payload.pagination?.limit ?? batch.length;
    if (batch.length === 0 || monitors.length >= total) break;
  }
  return monitors;
}

/* ── Snapshot model ────────────────────────────────────────────────── */

export type MonitorState = "up" | "down" | "degraded" | "paused" | "pending" | "unknown";
/** `none` = UptimeRobot reported no data for that day (paused / not created yet). */
export type DayState = "up" | "degraded" | "down" | "none";

export interface StatusDay {
  /** Unix seconds of local midnight, in `timeZone`. */
  date: number;
  uptime: number;
  incidents: number;
  /** Seconds of downtime attributed to this day. */
  downtime: number;
  state: DayState;
}

export interface StatusMonitor {
  id: number;
  /** UptimeRobot's `friendly_name`, verbatim. */
  name: string;
  /** Section heading the name parses into ("Backend", "Frontend", …). */
  group: string;
  /** The distinguishing part of the name ("Cloudflare", "Vercel", …). */
  label: string;
  url?: string;
  status: number;
  state: MonitorState;
  type: number;
  typeLabel: string;
  /** Check interval, seconds. */
  interval: number;
  /** Whole-window uptime, or null when the monitor reported no data at all. */
  uptime: number | null;
  incidents: number;
  downtime: number;
  lastIncident: { at: number; code: number | null; detail: string | null } | null;
  /** True while the most recent outage has not been resolved. */
  ongoing: boolean;
  /** Oldest first, so the chart reads left → right into today. */
  days: StatusDay[];
}

export interface StatusGroup {
  key: string;
  label: string;
  count: number;
  /** Monitors actually being checked; paused ones are excluded. */
  active: number;
  up: number;
  state: MonitorState;
  monitors: StatusMonitor[];
}

export interface StatusSummary {
  count: number;
  /** `count - paused`. */
  active: number;
  up: number;
  down: number;
  degraded: number;
  paused: number;
  pending: number;
  unknown: number;
  /** Monitors that reported any availability data. */
  measured: number;
  /** Mean daily availability across every day that has data. */
  uptime: number | null;
  incidents: number;
  downtime: number;
  state: "up" | "degraded" | "down" | "unknown";
}

export interface StatusSnapshot {
  generatedAt: number;
  days: number;
  timeZone: string;
  summary: StatusSummary;
  groups: StatusGroup[];
  /** False when every monitor fell into the catch-all group. */
  grouped: boolean;
}

const MONITOR_STATE: Record<number, MonitorState> = {
  0: "paused",
  1: "pending",
  2: "up",
  // 8 is UptimeRobot's "seems down" — a single failed probe that has not yet
  // been confirmed. Rendering it as an outage turns every blip into a red
  // page, so it maps to the warning rung instead.
  8: "degraded",
  9: "down",
};

const MONITOR_TYPE_LABEL: Record<number, string> = {
  1: "HTTP",
  2: "KEYWORD",
  3: "PING",
  4: "PORT",
  5: "HEARTBEAT",
  6: "SMTP",
  7: "IMAP",
  8: "POP3",
};

/** Group label for names that do not follow the `Site Group (Provider)` shape. */
export const UNGROUPED_LABEL = "其他服务";

const SITE_PREFIX = /^whu\.sb\s+/i;

/*
 * Three decimals, because that is UptimeRobot's own granularity and rounding
 * to two destroys the one distinction this page exists to make: `round(99.996)`
 * is exactly 100, which then classifies the day as fully available and paints
 * a column green over an incident that really happened. Anything finer than
 * the source is invention; anything coarser loses evidence.
 */
function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function typeLabel(monitor: UptimeRobotMonitor): string {
  const type = monitor.type ?? 1;
  const sub = (monitor.sub_type || "").trim();
  if (type === 1) {
    if (sub) return sub.toUpperCase();
    /*
     * `sub_type` comes back empty on this account, so the scheme is read off
     * the URL instead. Every monitor here is an https probe, and labelling all
     * of them "HTTP" is a small lie repeated once per card.
     */
    return /^https:/i.test((monitor.url || "").trim()) ? "HTTPS" : "HTTP";
  }
  if (type === 4) {
    if (sub) return sub.toUpperCase();
    if (monitor.port) return `PORT ${monitor.port}`;
  }
  return MONITOR_TYPE_LABEL[type] ?? "HTTP";
}

/*
 * `WHU.sb Backend (Cloudflare)` → group "Backend", label "Cloudflare".
 *
 * The dashboard names every monitor of a tier after the tier and every
 * provider in parentheses, which is exactly the two levels a status page wants
 * to show. Names that do not follow it fall through to the catch-all group and
 * keep their full name as the label, so an ungrouped monitor still reads fine.
 */
export function splitMonitorName(name: string): { group: string; label: string } {
  const trimmed = name.trim();
  const match = /^(.*?)\s*\(([^()]*)\)\s*$/.exec(trimmed);
  if (match && match[1].trim()) {
    const group = match[1].trim().replace(SITE_PREFIX, "");
    const label = match[2].trim();
    if (group && label) return { group, label };
  }
  return { group: UNGROUPED_LABEL, label: trimmed || "未命名服务" };
}

function normalizeReason(reason: UptimeRobotLog["reason"]): { code: number | null; detail: string | null } {
  if (!reason) return { code: null, detail: null };
  if (typeof reason === "string") return { code: null, detail: reason.slice(0, 120) };
  return {
    code: typeof reason.code === "number" ? reason.code : null,
    detail: typeof reason.detail === "string" ? reason.detail.slice(0, 120) : null,
  };
}

function dayState(uptime: number, incidents: number): DayState {
  if (uptime >= 100) return "up";
  if (uptime > 0) return incidents > 0 ? "degraded" : "up";
  // Zero is ambiguous: UptimeRobot reports 0.000 both for a day that was down
  // the whole way through and for one it has no data for (paused monitor,
  // monitor created later). The logs are what tells them apart.
  return incidents > 0 ? "down" : "none";
}

/**
 * Rebuilds per-day availability from the outage log.
 *
 * UptimeRobot only computes `custom_uptime_ranges` for a monitor that is
 * currently up: the moment one goes down (or is paused) every range in the
 * response collapses to `0.000`, including the 89 days that were fine. Read
 * literally, that turns a healthy service with one outage in progress into a
 * chart of grey "no data" columns and a 0% headline — which is exactly the
 * moment the page matters most.
 *
 * The logs are enough to reconstruct it. Each type-1 entry carries the outage's
 * start and, once resolved, its length; an unresolved one (length still 0) runs
 * to now. Overlapping those intervals against each day gives downtime per day,
 * and a day with no overlap and no logs was up throughout.
 *
 * Two limits are worth knowing. Days before `create_datetime` are excluded, so
 * a young monitor does not get credited with history it never had. And the log
 * list is capped by the API, so a monitor that flapped hundreds of times in the
 * window may under-report — still far closer than "no data".
 */
function reconstructDays(
  days: StatusDay[],
  bounds: { start: number; end: number }[],
  outages: { from: number; to: number }[],
  createDateTime: number,
  nowSeconds: number,
): number | null {
  let available = 0;
  let elapsed = 0;

  days.forEach((day, i) => {
    const bound = bounds[i];
    // A day still in progress only has `now - midnight` of it to account for;
    // dividing by a full 86400 would flatter an outage that started this morning.
    const end = Math.min(bound.end, nowSeconds);
    const length = end - bound.start;
    if (length <= 0 || bound.end <= createDateTime) {
      day.uptime = 0;
      day.downtime = 0;
      day.state = "none";
      return;
    }
    let down = 0;
    for (const outage of outages) {
      const from = Math.max(outage.from, bound.start);
      const to = Math.min(outage.to, end);
      if (to > from) down += to - from;
    }
    down = Math.min(down, length);
    elapsed += length;
    available += length - down;
    day.downtime = down;
    day.uptime = round3(((length - down) / length) * 100);
    /*
     * Not `dayState()`. That helper asks the incident count before calling a
     * sub-100 day degraded, because on the ranges path a monitor created at
     * noon reports ~50% for its first day with nothing wrong — the count is the
     * only way to tell "partial day" from "partial outage".
     *
     * Here the uptime is derived from the outage intervals themselves and days
     * before `create_datetime` have already been dropped, so a value below 100
     * can only mean real downtime. Consulting the count instead paints the
     * middle days of a multi-day outage green: the incident is booked to the
     * day it *started*, so day two has 26% availability and an incident count
     * of zero.
     */
    day.state = day.uptime >= 100 ? "up" : day.uptime > 0 ? "degraded" : "down";
  });

  return elapsed > 0 ? round3((available / elapsed) * 100) : null;
}

function toMonitor(
  raw: UptimeRobotMonitor,
  starts: number[],
  ends: number[],
  timeZone: string,
  showLinks: boolean,
  nowSeconds: number,
): StatusMonitor {
  const name = raw.friendly_name || "未命名服务";
  const { group, label } = splitMonitorName(name);
  /*
   * `starts` descends (today first, as UptimeRobot wants it); `days` ascends
   * (oldest first, as the chart reads it). Every index below crosses that
   * boundary with `length - 1 - i`, so the two orientations are reconciled
   * once here rather than at each consumer.
   */
  const days: StatusDay[] = starts
    .slice()
    .reverse()
    .map((date) => ({ date, uptime: 0, incidents: 0, downtime: 0, state: "none" as DayState }));
  const bounds = starts
    .slice()
    .reverse()
    .map((_, i) => ({ start: starts[starts.length - 1 - i], end: ends[ends.length - 1 - i] }));
  const indexByStart = new Map<number, number>();
  starts.forEach((start, i) => indexByStart.set(start, days.length - 1 - i));

  const ranges = (raw.custom_uptime_ranges || "").split("-");
  // The trailing entry is the whole-window range appended by buildRanges();
  // what is left lines up with `starts`, newest first.
  const total = Number.parseFloat(ranges.pop() ?? "");
  const daily = ranges.map((value) => Number.parseFloat(value));
  daily.forEach((parsed, i) => {
    const day = days[days.length - 1 - i];
    if (!day) return;
    if (Number.isFinite(parsed)) day.uptime = round3(parsed);
  });

  let incidents = 0;
  let downtime = 0;
  let lastIncident: StatusMonitor["lastIncident"] = null;
  let latestDown: { at: number; duration: number } | null = null;
  const outages: { from: number; to: number }[] = [];

  for (const log of raw.logs ?? []) {
    // Only type 1 opens an outage. Type 99 ("still down") repeats an incident
    // that is already counted, and its duration would double the downtime.
    if (log.type !== 1 || !log.datetime) continue;
    const seconds = Number.isFinite(log.duration) ? Math.max(0, Number(log.duration)) : 0;
    incidents += 1;
    downtime += seconds;
    // A length of 0 means UptimeRobot has not seen it come back yet.
    outages.push({ from: log.datetime, to: seconds > 0 ? log.datetime + seconds : nowSeconds });
    if (!lastIncident || log.datetime > lastIncident.at) {
      lastIncident = { at: log.datetime, ...normalizeReason(log.reason) };
    }
    if (!latestDown || log.datetime > latestDown.at) latestDown = { at: log.datetime, duration: seconds };
    const index = indexByStart.get(startOfDaySeconds(log.datetime * 1000, timeZone));
    const day = index === undefined ? undefined : days[index];
    if (day) {
      day.incidents += 1;
      day.downtime += seconds;
    }
  }

  const status = raw.status ?? 1;
  const state = MONITOR_STATE[status] ?? "unknown";

  /*
   * All-zero ranges on a monitor that is *being* checked are the collapsed
   * payload described above, not a 90-day outage — reconstruct from the logs.
   * Paused monitors are left alone: nothing was probing them, so there is no
   * honest number to publish and the columns stay "no data".
   */
  const rangesCollapsed =
    (status === 8 || status === 9) &&
    total === 0 &&
    daily.every((value) => !Number.isFinite(value) || value === 0);
  const reconstructed = rangesCollapsed
    ? reconstructDays(days, bounds, outages, raw.create_datetime ?? 0, nowSeconds)
    : null;

  if (reconstructed === null) {
    for (const day of days) day.state = dayState(day.uptime, day.incidents);
  }

  /*
   * UptimeRobot answers 0.000 for every range of a paused monitor, and the
   * payload carries nothing that distinguishes that from a window spent
   * entirely offline. The logs settle it: a zero total with at least one
   * incident really was an outage, while an all-zero history on a paused
   * monitor is simply unavailable data and must not be averaged in as 0%.
   */
  const reportedAny = days.some((day) => day.uptime > 0);
  const usableTotal =
    reconstructed !== null ||
    (Number.isFinite(total) && (reportedAny || (status !== 0 && incidents > 0)));
  const uptime = reconstructed !== null ? reconstructed : usableTotal ? round3(total) : null;
  return {
    id: raw.id,
    name,
    group,
    label,
    url: showLinks && raw.url ? raw.url : undefined,
    status,
    state,
    type: raw.type ?? 1,
    typeLabel: typeLabel(raw),
    interval: raw.interval ?? 0,
    uptime,
    incidents,
    downtime,
    lastIncident,
    // `duration` stays 0 on a down log until UptimeRobot sees the monitor come
    // back, so a zero-length latest incident on a monitor that is still
    // flagged down is an outage in progress rather than a one-second blip.
    ongoing: latestDown !== null && latestDown.duration === 0 && (state === "down" || state === "degraded"),
    days,
  };
}

function rollupState(counts: { count: number; up: number; down: number; degraded: number; paused: number }):
  | "up"
  | "degraded"
  | "down"
  | "unknown" {
  // Paused monitors are excluded from the verdict: they are deliberately not
  // being checked, and counting them would leave the banner permanently
  // "degraded" on any account with a retired monitor.
  const active = counts.count - counts.paused;
  if (active <= 0) return "unknown";
  if (counts.up === active) return "up";
  /*
   * "down" is reserved for a total outage. One dead edge out of twelve is a
   * partial failure, and calling that 服务中断 would put the red banner up on
   * every single-provider blip — after which nobody reads it. Everything
   * between all-up and all-down lands on `degraded`, which the page renders as
   * 部分中断 with the per-state counts spelled out underneath.
   */
  if (counts.down === active) return "down";
  return "degraded";
}

export function toStatusSnapshot(
  monitors: UptimeRobotMonitor[],
  starts: number[],
  options: StatusOptions,
  nowMs = Date.now(),
): StatusSnapshot {
  const ends = dayEnds(starts, options.timeZone);
  const nowSeconds = Math.floor(nowMs / 1000);
  const parsed = monitors.map((raw) =>
    toMonitor(raw, starts, ends, options.timeZone, options.showLinks, nowSeconds),
  );

  const perState: Record<MonitorState, number> = {
    up: 0,
    down: 0,
    degraded: 0,
    paused: 0,
    pending: 0,
    unknown: 0,
  };
  let incidents = 0;
  let downtime = 0;
  let measured = 0;
  /*
   * Availability is averaged over *days that have data*, not over monitors.
   * A per-monitor mean weights a monitor created yesterday exactly as heavily
   * as one with a full 90-day history, so two brand-new checks that have never
   * passed dragged a 99.9% fleet to 58% — a number that reads as a catastrophe
   * and describes nothing. Day-weighting makes the figure mean what the label
   * says: of all the service-days in the window, this fraction was available.
   */
  let dayUptimeSum = 0;
  let dayCount = 0;

  for (const monitor of parsed) {
    perState[monitor.state] += 1;
    incidents += monitor.incidents;
    downtime += monitor.downtime;
    if (monitor.uptime !== null) measured += 1;
    for (const day of monitor.days) {
      if (day.state === "none") continue;
      dayUptimeSum += day.uptime;
      dayCount += 1;
    }
  }
  const counts = { count: parsed.length, ...perState };
  const active = counts.count - counts.paused;

  const groups: StatusGroup[] = [];
  const byKey = new Map<string, StatusGroup>();
  for (const monitor of parsed) {
    let group = byKey.get(monitor.group);
    if (!group) {
      group = {
        key: monitor.group,
        label: monitor.group,
        count: 0,
        active: 0,
        up: 0,
        state: "unknown",
        monitors: [],
      };
      byKey.set(monitor.group, group);
      groups.push(group);
    }
    group.count += 1;
    if (monitor.state !== "paused") group.active += 1;
    if (monitor.state === "up") group.up += 1;
    group.monitors.push(monitor);
  }
  for (const group of groups) {
    group.state = rollupState({
      count: group.count,
      up: group.up,
      down: group.monitors.filter((m) => m.state === "down").length,
      degraded: group.monitors.filter((m) => m.state === "degraded").length,
      paused: group.monitors.filter((m) => m.state === "paused").length,
    });
  }
  // The catch-all sorts last: it is the bucket for names that did not follow
  // the convention, and pinning it below the real tiers keeps the page stable
  // when a monitor is renamed. `sort` is stable, so the tiers keep their order.
  groups.sort((a, b) => Number(b.key !== UNGROUPED_LABEL) - Number(a.key !== UNGROUPED_LABEL));

  return {
    generatedAt: nowMs,
    days: options.days,
    timeZone: options.timeZone,
    summary: {
      ...counts,
      active,
      measured,
      uptime: dayCount > 0 ? round3(dayUptimeSum / dayCount) : null,
      incidents,
      downtime,
      state: rollupState(counts),
    },
    groups,
    grouped: groups.length > 1 || groups[0]?.key !== UNGROUPED_LABEL,
  };
}

/** Fetch + shape in one call. This is the whole backend for the status page. */
export async function buildStatusSnapshot(
  options: StatusOptions,
  nowMs = Date.now(),
): Promise<StatusSnapshot> {
  if (!options.apiKey) {
    throw new StatusUpstreamError("not_configured", "UPTIMEROBOT_API_KEY is not set", 503);
  }
  const starts = dayWindow(nowMs, options.days, options.timeZone);
  const window = buildRanges(starts, options.timeZone);
  const monitors = await fetchAllMonitors(options, window);
  return toStatusSnapshot(monitors, starts, options, nowMs);
}

/* ── Response helpers ──────────────────────────────────────────────── */

export function statusCacheHeaders(ttl = DEFAULT_CACHE_TTL): Record<string, string> {
  return {
    // `max-age=0` keeps the browser out of it: the page polls and must never
    // serve itself a stale snapshot from its own HTTP cache.
    "Cache-Control": `public, max-age=0, must-revalidate, s-maxage=${ttl}, stale-while-revalidate=${ttl * 4}`,
    "CDN-Cache-Control": `public, s-maxage=${ttl}, stale-while-revalidate=${ttl * 4}`,
  };
}

export function statusJson(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
      ...headers,
    },
  });
}
