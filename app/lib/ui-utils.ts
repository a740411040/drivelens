import type { Incident } from "./demo-data";
import type { ReviewRecord } from "./ui-types";

export function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

export function riskTone(risk: Incident["risk"]): "danger" | "warning" | "success" {
  if (risk === "高") return "danger";
  if (risk === "中") return "warning";
  return "success";
}

export function statusFor(incident: Incident, review?: ReviewRecord) {
  if (review?.decision === "confirmed") return "已核验";
  if (review?.decision === "needs_evidence") return "补证中";
  if (review?.decision === "rejected") return "重新研判";
  return incident.status;
}

export function reviewForSnapshot(
  incidentId: string,
  snapshotId: string,
  reviews: Record<string, ReviewRecord>,
) {
  const review = reviews[incidentId];
  return review?.snapshotId === snapshotId ? review : undefined;
}
