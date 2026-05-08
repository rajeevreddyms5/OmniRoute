import {
  getStorageSyncSettings,
  recordStorageSyncError,
  updateStorageSyncSettings,
} from "@/lib/db/storageSync";
import {
  listStorageSnapshots,
  resolveRcloneBinary,
  restoreStorageSnapshot,
  uploadStorageSnapshot,
} from "@/lib/storageSync/rclone";

let schedulerTimer: NodeJS.Timeout | null = null;
let startupTimer: NodeJS.Timeout | null = null;
let running = false;

function getIntervalMs() {
  const settings = getStorageSyncSettings();
  return Math.max(5, settings.autoIntervalMinutes) * 60 * 1000;
}

async function runStorageSyncCycle() {
  if (running) return;
  running = true;

  try {
    const settings = getStorageSyncSettings();
    if (!settings.enabled || (!settings.autoUpload && !settings.autoRestore)) return;
    if (!settings.rcloneRemote) return;

    const rclone = await resolveRcloneBinary();
    if (!rclone.available) return;

    if (settings.autoUpload) {
      const result = await uploadStorageSnapshot();
      updateStorageSyncSettings({
        lastRemoteSnapshot: new Date().toISOString(),
        lastError: null,
      });
      console.log(`[StorageSync] Uploaded ${result.filename}`);
      return;
    }

    if (settings.autoRestore) {
      const snapshots = await listStorageSnapshots();
      const latest = snapshots.find((snapshot) => snapshot.name === "latest.omni-sync");
      if (latest?.modifiedAt && latest.modifiedAt !== settings.lastRemoteSnapshot) {
        await restoreStorageSnapshot("latest.omni-sync");
        updateStorageSyncSettings({ lastRemoteSnapshot: latest.modifiedAt, lastError: null });
        return;
      }
    }
  } catch (error) {
    recordStorageSyncError(error);
    console.warn("[StorageSync] Cycle failed:", error instanceof Error ? error.message : error);
  } finally {
    running = false;
  }
}

export function startStorageSyncScheduler(): void {
  if (schedulerTimer || startupTimer) return;

  const scheduleRecurring = () => {
    schedulerTimer = setInterval(() => {
      void runStorageSyncCycle();
    }, getIntervalMs());
    schedulerTimer.unref?.();
  };

  startupTimer = setTimeout(() => {
    startupTimer = null;
    void runStorageSyncCycle();
    scheduleRecurring();
  }, 45_000);
  startupTimer.unref?.();
}

export function stopStorageSyncScheduler(): void {
  if (startupTimer) {
    clearTimeout(startupTimer);
    startupTimer = null;
  }
  if (schedulerTimer) {
    clearInterval(schedulerTimer);
    schedulerTimer = null;
  }
}

export async function runStorageSyncCycleNow() {
  await runStorageSyncCycle();
}
