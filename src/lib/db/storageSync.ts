import { getDbInstance } from "./core";
import { backupDbFile } from "./backup";

export type StorageSyncProvider = "rclone";

export interface StorageSyncSettings {
  enabled: boolean;
  provider: StorageSyncProvider;
  rcloneRemote: string;
  remotePrefix: string;
  keepLatest: number;
  encryptionMode: "cloud" | "app";
  autoUpload: boolean;
  autoRestore: boolean;
  autoIntervalMinutes: number;
  lastRemoteSnapshot: string | null;
  lastUploadAt: string | null;
  lastRestoreAt: string | null;
  lastError: string | null;
}

const STORAGE_SYNC_NAMESPACE = "storageSync";

const DEFAULT_STORAGE_SYNC_SETTINGS: StorageSyncSettings = {
  enabled: false,
  provider: "rclone",
  rcloneRemote: "",
  remotePrefix: "backups",
  keepLatest: 10,
  encryptionMode: "cloud",
  autoUpload: false,
  autoRestore: false,
  autoIntervalMinutes: 60,
  lastRemoteSnapshot: null,
  lastUploadAt: null,
  lastRestoreAt: null,
  lastError: null,
};

function parseStoredValue(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function coerceSettings(updates: Partial<StorageSyncSettings>): StorageSyncSettings {
  return {
    ...DEFAULT_STORAGE_SYNC_SETTINGS,
    ...updates,
    provider: "rclone",
    rcloneRemote:
      typeof updates.rcloneRemote === "string"
        ? updates.rcloneRemote.trim()
        : DEFAULT_STORAGE_SYNC_SETTINGS.rcloneRemote,
    remotePrefix:
      typeof updates.remotePrefix === "string" && updates.remotePrefix.trim()
        ? updates.remotePrefix.trim().replace(/^\/+|\/+$/g, "")
        : DEFAULT_STORAGE_SYNC_SETTINGS.remotePrefix,
    keepLatest:
      Number.isInteger(updates.keepLatest) && Number(updates.keepLatest) > 0
        ? Math.min(Number(updates.keepLatest), 100)
        : DEFAULT_STORAGE_SYNC_SETTINGS.keepLatest,
    encryptionMode: updates.encryptionMode === "app" ? "app" : "cloud",
    autoUpload: updates.autoUpload === true,
    autoRestore: updates.autoRestore === true,
    autoIntervalMinutes:
      Number.isInteger(updates.autoIntervalMinutes) && Number(updates.autoIntervalMinutes) >= 5
        ? Math.min(Number(updates.autoIntervalMinutes), 1440)
        : DEFAULT_STORAGE_SYNC_SETTINGS.autoIntervalMinutes,
    lastRemoteSnapshot:
      typeof updates.lastRemoteSnapshot === "string" && updates.lastRemoteSnapshot
        ? updates.lastRemoteSnapshot
        : null,
    lastUploadAt:
      typeof updates.lastUploadAt === "string" && updates.lastUploadAt
        ? updates.lastUploadAt
        : null,
    lastRestoreAt:
      typeof updates.lastRestoreAt === "string" && updates.lastRestoreAt
        ? updates.lastRestoreAt
        : null,
    lastError:
      typeof updates.lastError === "string" && updates.lastError ? updates.lastError : null,
  };
}

export function getStorageSyncSettings(): StorageSyncSettings {
  const db = getDbInstance();
  const rows = db
    .prepare("SELECT key, value FROM key_value WHERE namespace = ?")
    .all(STORAGE_SYNC_NAMESPACE) as Array<{ key?: unknown; value?: unknown }>;

  const stored: Partial<StorageSyncSettings> = {};
  for (const row of rows) {
    if (typeof row.key !== "string" || typeof row.value !== "string") continue;
    (stored as Record<string, unknown>)[row.key] = parseStoredValue(row.value);
  }

  return coerceSettings(stored);
}

export function updateStorageSyncSettings(
  updates: Partial<StorageSyncSettings>
): StorageSyncSettings {
  const current = getStorageSyncSettings();
  const definedUpdates = Object.fromEntries(
    Object.entries(updates).filter(([, value]) => value !== undefined)
  ) as Partial<StorageSyncSettings>;
  const next = coerceSettings({ ...current, ...definedUpdates });
  const db = getDbInstance();
  const insert = db.prepare(
    "INSERT OR REPLACE INTO key_value (namespace, key, value) VALUES (?, ?, ?)"
  );

  const tx = db.transaction(() => {
    for (const [key, value] of Object.entries(next)) {
      insert.run(STORAGE_SYNC_NAMESPACE, key, JSON.stringify(value));
    }
  });
  tx();

  backupDbFile("pre-write");
  return next;
}

export function recordStorageSyncSuccess(kind: "upload" | "restore"): StorageSyncSettings {
  const timestamp = new Date().toISOString();
  return updateStorageSyncSettings(
    kind === "upload"
      ? { lastUploadAt: timestamp, lastRemoteSnapshot: "latest.omni-sync", lastError: null }
      : { lastRestoreAt: timestamp, lastRemoteSnapshot: "latest.omni-sync", lastError: null }
  );
}

export function recordStorageSyncError(error: unknown): StorageSyncSettings {
  const message = error instanceof Error ? error.message : String(error);
  return updateStorageSyncSettings({ lastError: message.slice(0, 500) });
}
