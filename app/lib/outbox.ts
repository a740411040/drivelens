import type { EvidenceTask } from "./feishu-ai";
import type { FeishuSyncRequest } from "./ui-types";

/**
 * 本地待同步队列（outbox）。
 *
 * 早期实现只把载荷写进 localStorage，没有任何读取、展示或重试入口，
 * “队列”名不副实。这里提供统一的读写/删除/重放契约：
 * - 同步失败时保存原始请求体（可原样重放），而不是只保存已格式化的字段；
 * - UI 可读取队列、展示条目、逐条重试、成功后移除。
 */

export const FEISHU_OUTBOX_KEY = "drivelens.feishu-outbox.v1";
export const FEISHU_AI_TASK_OUTBOX_KEY = "drivelens.feishu-ai-task-outbox.v1";

export interface FeishuOutboxEntry {
  eventId: string;
  /** 原始请求体，重试时原样 POST 到 /api/feishu。 */
  request: FeishuSyncRequest;
  queuedAt: string;
}

export interface FeishuAiTaskOutboxEntry {
  eventId: string;
  snapshotId: string;
  evidenceMode: "logs_only" | "scene_verified";
  tasks: EvidenceTask[];
  queuedAt: string;
}

/** 兼容旧格式：仅含格式化字段的条目无法原样重放，只读展示并允许丢弃。 */
export function isReplayableOutboxEntry(entry: FeishuOutboxEntry): boolean {
  return Boolean(entry?.request?.eventId && entry?.request?.snapshotId);
}

export function readOutbox<T>(key: string): T[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

export function writeOutbox<T>(key: string, entries: T[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(entries));
  } catch {
    // 存储不可用（隐私模式/配额）时静默失败；不阻塞主流程。
  }
}

export function upsertOutboxEntry<T extends { eventId: string }>(key: string, entry: T): T[] {
  const next = [...readOutbox<T>(key).filter((item) => item.eventId !== entry.eventId), entry];
  writeOutbox(key, next);
  return next;
}

export function removeOutboxEntry<T extends { eventId: string }>(key: string, eventId: string): T[] {
  const next = readOutbox<T>(key).filter((item) => item.eventId !== eventId);
  writeOutbox(key, next);
  return next;
}
