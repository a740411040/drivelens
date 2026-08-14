import { incidents, type Incident } from "./demo-data";
import {
  createRealCaseSnapshot,
  getRealCaseById,
  realCaseToIncident,
  type RealCase,
} from "./real-diagnostic";
import {
  createDiagnosticSnapshot,
  type DiagnosticSnapshot,
  type EvidenceMode,
} from "./diagnostic-snapshot";

export type IncidentSource = "demo" | "real_case_derived";

export interface ResolvedIncident {
  incident: Incident;
  snapshot: DiagnosticSnapshot;
  source: IncidentSource;
  realCase?: RealCase;
}

export function resolveIncident(
  eventId: string,
  mode: EvidenceMode = "logs_only",
): ResolvedIncident | undefined {
  const demoIncident = incidents.find((item) => item.id === eventId);
  if (demoIncident) {
    return {
      incident: demoIncident,
      snapshot: createDiagnosticSnapshot(demoIncident, mode),
      source: "demo",
    };
  }

  const realCase = getRealCaseById(eventId);
  if (!realCase) return undefined;
  const incident = realCaseToIncident(realCase);
  return {
    incident,
    snapshot: createRealCaseSnapshot(realCase, mode),
    source: "real_case_derived",
    realCase,
  };
}

export type StrictResolveError =
  | "unknown_event"
  | "real_case_supplement_unsupported";

export type StrictResolveOutcome =
  | { ok: true; resolved: ResolvedIncident }
  | { ok: false; status: 400 | 404; error: StrictResolveError };

/**
 * 严格解析：真实案例没有现场补证阶段，scene_verified 请求会被
 * createRealCaseSnapshot 静默降级为 logs_only。为了让 API 消费者看到
 * 明确错误而不是收到一个“看起来是 V1 实际是 L0”的快照，这里直接拒绝。
 */
export function resolveIncidentStrict(
  eventId: string | undefined,
  mode: EvidenceMode = "logs_only",
): StrictResolveOutcome {
  if (!eventId) return { ok: false, status: 404, error: "unknown_event" };
  if (mode === "scene_verified" && getRealCaseById(eventId)) {
    return {
      ok: false,
      status: 400,
      error: "real_case_supplement_unsupported",
    };
  }
  const resolved = resolveIncident(eventId, mode);
  if (!resolved) return { ok: false, status: 404, error: "unknown_event" };
  return { ok: true, resolved };
}
