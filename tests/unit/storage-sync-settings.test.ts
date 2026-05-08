import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const TEST_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "omniroute-storage-sync-settings-"));
const ORIGINAL_DATA_DIR = process.env.DATA_DIR;
const ORIGINAL_DISABLE_BACKUP = process.env.DISABLE_SQLITE_AUTO_BACKUP;

process.env.DATA_DIR = TEST_DATA_DIR;
process.env.DISABLE_SQLITE_AUTO_BACKUP = "true";

const core = await import("../../src/lib/db/core.ts");
const storageSync = await import("../../src/lib/db/storageSync.ts");

function resetStorage() {
  core.resetDbInstance();
  fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true });
  fs.mkdirSync(TEST_DATA_DIR, { recursive: true });
}

test.beforeEach(() => {
  resetStorage();
});

test.after(() => {
  core.resetDbInstance();
  fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true });

  if (ORIGINAL_DATA_DIR === undefined) {
    delete process.env.DATA_DIR;
  } else {
    process.env.DATA_DIR = ORIGINAL_DATA_DIR;
  }

  if (ORIGINAL_DISABLE_BACKUP === undefined) {
    delete process.env.DISABLE_SQLITE_AUTO_BACKUP;
  } else {
    process.env.DISABLE_SQLITE_AUTO_BACKUP = ORIGINAL_DISABLE_BACKUP;
  }
});

test("storage sync settings default to disabled rclone config", () => {
  const settings = storageSync.getStorageSyncSettings();

  assert.equal(settings.enabled, false);
  assert.equal(settings.provider, "rclone");
  assert.equal(settings.rcloneRemote, "");
  assert.equal(settings.remotePrefix, "backups");
  assert.equal(settings.keepLatest, 10);
  assert.equal(settings.encryptionMode, "cloud");
  assert.equal(settings.autoUpload, false);
  assert.equal(settings.autoRestore, false);
  assert.equal(settings.autoIntervalMinutes, 60);
  assert.equal(settings.lastUploadAt, null);
  assert.equal(settings.lastRestoreAt, null);
});

test("storage sync settings persist defined updates without resetting omitted fields", () => {
  const first = storageSync.updateStorageSyncSettings({
    enabled: true,
    rcloneRemote: "gdrive:OmniRoute",
    remotePrefix: "/omniroute/backups/",
    keepLatest: 7,
    encryptionMode: "app",
    autoUpload: true,
    autoRestore: true,
    autoIntervalMinutes: 15,
  });

  assert.equal(first.enabled, true);
  assert.equal(first.rcloneRemote, "gdrive:OmniRoute");
  assert.equal(first.remotePrefix, "omniroute/backups");
  assert.equal(first.keepLatest, 7);
  assert.equal(first.encryptionMode, "app");
  assert.equal(first.autoUpload, true);
  assert.equal(first.autoRestore, true);
  assert.equal(first.autoIntervalMinutes, 15);

  const second = storageSync.updateStorageSyncSettings({ lastError: "temporary failure" });

  assert.equal(second.enabled, true);
  assert.equal(second.rcloneRemote, "gdrive:OmniRoute");
  assert.equal(second.keepLatest, 7);
  assert.equal(second.encryptionMode, "app");
  assert.equal(second.autoUpload, true);
  assert.equal(second.lastError, "temporary failure");
});

test("storage sync success markers preserve the previous marker", () => {
  const uploaded = storageSync.recordStorageSyncSuccess("upload");
  assert.equal(typeof uploaded.lastUploadAt, "string");
  assert.equal(uploaded.lastRestoreAt, null);

  const restored = storageSync.recordStorageSyncSuccess("restore");
  assert.equal(typeof restored.lastUploadAt, "string");
  assert.equal(typeof restored.lastRestoreAt, "string");
  assert.equal(restored.lastError, null);
});
