"use client";

/**
 * localStorage-based offline operation queue.
 * Operations are stored when the network is unavailable and synced on reconnect.
 */

export type OfflineOpType = "create_incident" | "update_inspection_item" | "add_comment";

export interface OfflineOp {
  id: string;
  type: OfflineOpType;
  url: string;
  method: "POST" | "PATCH" | "PUT";
  payload: unknown;
  createdAt: string;
  retries: number;
}

const QUEUE_KEY = "pg_offline_ops";
const MAX_RETRIES = 3;

export const OfflineQueue = {
  get(): OfflineOp[] {
    if (typeof window === "undefined") return [];
    try {
      return JSON.parse(localStorage.getItem(QUEUE_KEY) ?? "[]");
    } catch {
      return [];
    }
  },

  add(op: Omit<OfflineOp, "id" | "createdAt" | "retries">): void {
    const items = OfflineQueue.get();
    items.push({
      ...op,
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      retries: 0,
    });
    localStorage.setItem(QUEUE_KEY, JSON.stringify(items));
  },

  remove(id: string): void {
    const items = OfflineQueue.get().filter((i) => i.id !== id);
    localStorage.setItem(QUEUE_KEY, JSON.stringify(items));
  },

  size(): number {
    return OfflineQueue.get().length;
  },

  async sync(token: string): Promise<{ synced: number; failed: number }> {
    const items = OfflineQueue.get();
    let synced = 0;
    let failed = 0;

    for (const op of items) {
      if (op.retries >= MAX_RETRIES) {
        OfflineQueue.remove(op.id);
        failed++;
        continue;
      }
      try {
        const res = await fetch(op.url, {
          method: op.method,
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(op.payload),
        });
        if (res.ok) {
          OfflineQueue.remove(op.id);
          synced++;
        } else {
          // Bump retry count
          const updated = OfflineQueue.get().map((i) =>
            i.id === op.id ? { ...i, retries: i.retries + 1 } : i
          );
          localStorage.setItem(QUEUE_KEY, JSON.stringify(updated));
          failed++;
        }
      } catch {
        const updated = OfflineQueue.get().map((i) =>
          i.id === op.id ? { ...i, retries: i.retries + 1 } : i
        );
        localStorage.setItem(QUEUE_KEY, JSON.stringify(updated));
        failed++;
      }
    }

    return { synced, failed };
  },
};
