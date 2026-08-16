import type { EvidenceMode } from "./diagnostic-snapshot";
import type { DataSource } from "./ui-types";

export type ReplaySearchParams = Record<string, string | string[] | undefined>;

export interface ReplayState {
  eventId?: string;
  source?: DataSource;
  evidenceMode: EvidenceMode;
}

function first(value: string | string[] | undefined): string | undefined {
  const candidate = Array.isArray(value) ? value[0] : value;
  const trimmed = candidate?.trim();
  return trimmed ? trimmed : undefined;
}

export function parseReplayState(params: ReplaySearchParams): ReplayState {
  const eventId = first(params.event)?.slice(0, 80);
  const rawSource = first(params.source);
  const rawMode = first(params.mode) ?? first(params.evidenceMode);

  return {
    eventId,
    source: rawSource === "real" || rawSource === "demo" ? rawSource : undefined,
    evidenceMode: rawMode === "scene_verified" ? "scene_verified" : "logs_only",
  };
}

export function buildReplayUrl(
  baseUrl: string,
  eventId: string,
  source: DataSource,
  evidenceMode: EvidenceMode,
): string {
  try {
    const url = new URL(baseUrl);
    url.searchParams.set("event", eventId);
    url.searchParams.set("source", source);
    url.searchParams.set("mode", evidenceMode);
    return url.toString();
  } catch {
    return baseUrl;
  }
}
