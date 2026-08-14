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
