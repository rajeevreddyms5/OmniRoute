import { execFile } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import https from "node:https";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import zlib from "node:zlib";
import Database from "better-sqlite3";
import { DATA_DIR, getDbInstance } from "@/lib/db/core";
import { restoreDbBackup } from "@/lib/db/backup";
import {
  getStorageSyncSettings,
  recordStorageSyncError,
  recordStorageSyncSuccess,
} from "@/lib/db/storageSync";

const execFileAsync = promisify(execFile);
const gzipAsync = promisify(zlib.gzip);
const gunzipAsync = promisify(zlib.gunzip);

const SNAPSHOT_FORMAT = "omniroute-storage-sync-v1";
const PLAIN_SNAPSHOT_FORMAT = "omniroute-storage-sync-plain-v1";
const RCLONE_TIMEOUT_MS = 120_000;
const INSTALL_TIMEOUT_MS = 300_000;

interface EncryptedSnapshot {
  format: typeof SNAPSHOT_FORMAT;
  createdAt: string;
  nonce: string;
  tag: string;
  algorithm: "aes-256-gcm";
  compressed: "gzip";
  ciphertext: string;
  metadata: {
    app: "omniroute";
    platform: NodeJS.Platform;
    hostname: string;
  };
}

interface PlainSnapshot {
  format: typeof PLAIN_SNAPSHOT_FORMAT;
  createdAt: string;
  compressed: "gzip";
  sqlite: string;
  metadata: {
    app: "omniroute";
    platform: NodeJS.Platform;
    hostname: string;
  };
}

export interface RcloneStatus {
  available: boolean;
  path: string | null;
  version: string | null;
}

export interface RemoteStorageSnapshot {
  name: string;
  path: string;
  size: number;
  modifiedAt: string | null;
}

function executableName() {
  return process.platform === "win32" ? "rclone.exe" : "rclone";
}

function privateRclonePath() {
  return path.join(DATA_DIR, "tools", "rclone", executableName());
}

function bundledRclonePath() {
  return path.join(process.cwd(), "tools", "rclone", executableName());
}

function configuredRclonePath() {
  const configured = process.env.RCLONE_PATH?.trim();
  return configured ? path.resolve(configured) : null;
}

async function getRcloneVersion(rclonePath: string) {
  try {
    const result = await execFileAsync(rclonePath, ["version"], {
      timeout: 10_000,
      windowsHide: true,
      maxBuffer: 1024 * 1024,
    });
    return result.stdout.split(/\r?\n/)[0]?.trim() || "rclone";
  } catch {
    return null;
  }
}

export async function resolveRcloneBinary(): Promise<RcloneStatus> {
  const candidates = [
    configuredRclonePath(),
    privateRclonePath(),
    bundledRclonePath(),
    executableName(),
  ].filter(Boolean) as string[];

  for (const candidate of candidates) {
    if (path.isAbsolute(candidate) && !fs.existsSync(candidate)) continue;
    const version = await getRcloneVersion(candidate);
    if (version) {
      return {
        available: true,
        path: candidate,
        version,
      };
    }
  }

  return { available: false, path: null, version: null };
}

function rcloneDownloadUrl() {
  const arch = os.arch();
  const archName = arch === "arm64" ? "arm64" : arch === "ia32" ? "386" : "amd64";
  if (process.platform === "win32") {
    return `https://downloads.rclone.org/rclone-current-windows-${archName}.zip`;
  }
  if (process.platform === "darwin") {
    return `https://downloads.rclone.org/rclone-current-osx-${archName}.zip`;
  }
  if (process.platform === "linux") {
    return `https://downloads.rclone.org/rclone-current-linux-${archName}.zip`;
  }
  throw new Error(`Automatic rclone install is not supported on ${process.platform}`);
}

function downloadFile(url: string, destination: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(destination);
    https
      .get(url, (response) => {
        if (
          response.statusCode &&
          response.statusCode >= 300 &&
          response.statusCode < 400 &&
          response.headers.location
        ) {
          file.close();
          fs.unlinkSync(destination);
          downloadFile(new URL(response.headers.location, url).toString(), destination).then(
            resolve,
            reject
          );
          return;
        }

        if (response.statusCode !== 200) {
          file.close();
          fs.unlink(destination, () => {});
          reject(new Error(`Failed to download rclone: HTTP ${response.statusCode}`));
          return;
        }

        response.pipe(file);
        file.on("finish", () => file.close(() => resolve()));
      })
      .on("error", (error) => {
        file.close();
        fs.unlink(destination, () => {});
        reject(error);
      });
  });
}

async function extractZip(zipPath: string, destination: string) {
  fs.mkdirSync(destination, { recursive: true });
  if (process.platform === "win32") {
    await execFileAsync(
      "powershell.exe",
      [
        "-NoProfile",
        "-Command",
        "Expand-Archive -LiteralPath $args[0] -DestinationPath $args[1] -Force",
        zipPath,
        destination,
      ],
      { timeout: INSTALL_TIMEOUT_MS, windowsHide: true }
    );
    return;
  }

  await execFileAsync("unzip", ["-o", zipPath, "-d", destination], {
    timeout: INSTALL_TIMEOUT_MS,
    windowsHide: true,
  });
}

function findExtractedRclone(root: string): string | null {
  const stack = [root];
  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) continue;
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const entryPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(entryPath);
      } else if (entry.name === executableName()) {
        return entryPath;
      }
    }
  }
  return null;
}

export async function installPrivateRclone(): Promise<RcloneStatus> {
  const existing = await resolveRcloneBinary();
  if (existing.available && existing.path === privateRclonePath()) return existing;

  const toolsDir = path.dirname(privateRclonePath());
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "omniroute-rclone-"));
  const zipPath = path.join(tempDir, "rclone.zip");

  try {
    await downloadFile(rcloneDownloadUrl(), zipPath);
    await extractZip(zipPath, tempDir);
    const extracted = findExtractedRclone(tempDir);
    if (!extracted) throw new Error("Downloaded rclone archive did not contain an executable");

    fs.mkdirSync(toolsDir, { recursive: true });
    fs.copyFileSync(extracted, privateRclonePath());
    if (process.platform !== "win32") fs.chmodSync(privateRclonePath(), 0o755);

    const status = await resolveRcloneBinary();
    if (!status.available) throw new Error("Installed rclone could not be executed");
    return status;
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

async function requireRcloneBinary() {
  const status = await resolveRcloneBinary();
  if (!status.available || !status.path) {
    throw new Error(
      "rclone is not installed. Install it from the storage sync status endpoint first."
    );
  }
  return status.path;
}

function normalizeRemotePrefix(prefix: string) {
  return prefix.trim().replace(/^\/+|\/+$/g, "") || "backups";
}

function buildRemotePath(filename?: string) {
  const settings = getStorageSyncSettings();
  if (!settings.rcloneRemote) {
    throw new Error("Storage sync rclone remote is not configured");
  }

  const base = settings.rcloneRemote.replace(/\/+$/g, "");
  const prefix = normalizeRemotePrefix(settings.remotePrefix);
  return filename ? `${base}/${prefix}/${filename}` : `${base}/${prefix}`;
}

function getSnapshotSecret() {
  const secret =
    process.env.STORAGE_SYNC_ENCRYPTION_KEY ||
    process.env.STORAGE_ENCRYPTION_KEY ||
    process.env.API_KEY_SECRET;
  if (!secret || secret.trim().length < 16) {
    throw new Error(
      "Set STORAGE_SYNC_ENCRYPTION_KEY, STORAGE_ENCRYPTION_KEY, or API_KEY_SECRET before using storage sync."
    );
  }
  return crypto.createHash("sha256").update(secret).digest();
}

async function encryptSqliteBackup(sqlitePath: string, encryptedPath: string) {
  const compressed = await gzipAsync(fs.readFileSync(sqlitePath));
  const nonce = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", getSnapshotSecret(), nonce);
  const ciphertext = Buffer.concat([cipher.update(compressed), cipher.final()]);
  const snapshot: EncryptedSnapshot = {
    format: SNAPSHOT_FORMAT,
    createdAt: new Date().toISOString(),
    nonce: nonce.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
    algorithm: "aes-256-gcm",
    compressed: "gzip",
    ciphertext: ciphertext.toString("base64"),
    metadata: {
      app: "omniroute",
      platform: process.platform,
      hostname: os.hostname(),
    },
  };
  fs.writeFileSync(encryptedPath, JSON.stringify(snapshot), "utf8");
}

async function writePlainSnapshot(sqlitePath: string, snapshotPath: string) {
  const compressed = await gzipAsync(fs.readFileSync(sqlitePath));
  const snapshot: PlainSnapshot = {
    format: PLAIN_SNAPSHOT_FORMAT,
    createdAt: new Date().toISOString(),
    compressed: "gzip",
    sqlite: compressed.toString("base64"),
    metadata: {
      app: "omniroute",
      platform: process.platform,
      hostname: os.hostname(),
    },
  };
  fs.writeFileSync(snapshotPath, JSON.stringify(snapshot), "utf8");
}

async function decryptSnapshot(encryptedPath: string, sqlitePath: string) {
  const parsed = JSON.parse(fs.readFileSync(encryptedPath, "utf8")) as
    | EncryptedSnapshot
    | PlainSnapshot;

  if (parsed.format === PLAIN_SNAPSHOT_FORMAT) {
    fs.writeFileSync(sqlitePath, await gunzipAsync(Buffer.from(parsed.sqlite, "base64")));
    return;
  }

  if (parsed.format !== SNAPSHOT_FORMAT || parsed.algorithm !== "aes-256-gcm") {
    throw new Error("Unsupported storage sync snapshot format");
  }

  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    getSnapshotSecret(),
    Buffer.from(parsed.nonce, "base64")
  );
  decipher.setAuthTag(Buffer.from(parsed.tag, "base64"));
  const compressed = Buffer.concat([
    decipher.update(Buffer.from(parsed.ciphertext, "base64")),
    decipher.final(),
  ]);
  fs.writeFileSync(sqlitePath, await gunzipAsync(compressed));
}

async function writeSnapshot(sqlitePath: string, snapshotPath: string) {
  const settings = getStorageSyncSettings();
  if (settings.encryptionMode === "app") {
    await encryptSqliteBackup(sqlitePath, snapshotPath);
    return;
  }
  await writePlainSnapshot(sqlitePath, snapshotPath);
}

function validateSqliteBackup(sqlitePath: string) {
  const db = new Database(sqlitePath, { readonly: true, fileMustExist: true });
  try {
    const result = db.pragma("integrity_check") as Array<{ integrity_check?: string }>;
    if (result[0]?.integrity_check !== "ok") {
      throw new Error("Downloaded snapshot failed SQLite integrity check");
    }
  } finally {
    db.close();
  }
}

function snapshotFilename(kind: "latest" | "timestamped") {
  if (kind === "latest") return "latest.omni-sync";
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  return `omniroute-${timestamp}.omni-sync`;
}

export async function uploadStorageSnapshot() {
  const rclonePath = await requireRcloneBinary();
  const settings = getStorageSyncSettings();
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "omniroute-storage-sync-"));
  const sqlitePath = path.join(tempDir, "storage.sqlite");
  const encryptedPath = path.join(tempDir, snapshotFilename("timestamped"));
  const latestPath = path.join(tempDir, snapshotFilename("latest"));

  try {
    await getDbInstance().backup(sqlitePath);
    await writeSnapshot(sqlitePath, encryptedPath);
    fs.copyFileSync(encryptedPath, latestPath);

    const timestampedName = path.basename(encryptedPath);
    await execFileAsync(rclonePath, ["copyto", encryptedPath, buildRemotePath(timestampedName)], {
      timeout: RCLONE_TIMEOUT_MS,
      windowsHide: true,
    });
    await execFileAsync(rclonePath, ["copyto", latestPath, buildRemotePath("latest.omni-sync")], {
      timeout: RCLONE_TIMEOUT_MS,
      windowsHide: true,
    });
    await pruneRemoteSnapshots(settings.keepLatest);

    recordStorageSyncSuccess("upload");
    return {
      uploaded: true,
      filename: timestampedName,
      latest: "latest.omni-sync",
      remotePath: buildRemotePath(timestampedName),
      size: fs.statSync(encryptedPath).size,
    };
  } catch (error) {
    recordStorageSyncError(error);
    throw error;
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

async function deleteRemoteSnapshot(filename: string) {
  const rclonePath = await requireRcloneBinary();
  await execFileAsync(rclonePath, ["deletefile", buildRemotePath(filename)], {
    timeout: RCLONE_TIMEOUT_MS,
    windowsHide: true,
  });
}

async function pruneRemoteSnapshots(keepLatest: number) {
  const limit = Math.max(1, Math.min(100, keepLatest));
  try {
    const snapshots = (await listStorageSnapshots()).filter(
      (snapshot) => snapshot.name !== "latest.omni-sync"
    );
    const overflow = snapshots.slice(limit);
    for (const snapshot of overflow) {
      await deleteRemoteSnapshot(snapshot.name);
    }
  } catch (error) {
    console.warn(
      "[StorageSync] Remote snapshot pruning failed:",
      error instanceof Error ? error.message : error
    );
  }
}

export async function listStorageSnapshots(): Promise<RemoteStorageSnapshot[]> {
  const rclonePath = await requireRcloneBinary();
  const result = await execFileAsync(rclonePath, ["lsjson", buildRemotePath()], {
    timeout: RCLONE_TIMEOUT_MS,
    windowsHide: true,
    maxBuffer: 5 * 1024 * 1024,
  });

  const entries = JSON.parse(result.stdout || "[]") as Array<{
    Name?: string;
    Path?: string;
    Size?: number;
    ModTime?: string;
    IsDir?: boolean;
  }>;
  return entries
    .filter(
      (entry) => !entry.IsDir && typeof entry.Name === "string" && entry.Name.endsWith(".omni-sync")
    )
    .map((entry) => ({
      name: String(entry.Name),
      path: String(entry.Path || entry.Name),
      size: Number(entry.Size || 0),
      modifiedAt: typeof entry.ModTime === "string" ? entry.ModTime : null,
    }))
    .sort((a, b) => String(b.modifiedAt || "").localeCompare(String(a.modifiedAt || "")));
}

export async function restoreStorageSnapshot(filename = "latest.omni-sync") {
  if (filename.includes("/") || filename.includes("\\") || !filename.endsWith(".omni-sync")) {
    throw new Error("Invalid storage sync snapshot filename");
  }

  const rclonePath = await requireRcloneBinary();
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "omniroute-storage-restore-"));
  const encryptedPath = path.join(tempDir, filename);
  const sqlitePath = path.join(tempDir, "storage.sqlite");
  const backupDir = path.join(DATA_DIR, "db_backups");
  const restoreId = `db_${new Date().toISOString().replace(/[:.]/g, "-")}_storage-sync.sqlite`;
  const restorePath = path.join(backupDir, restoreId);

  try {
    await execFileAsync(rclonePath, ["copyto", buildRemotePath(filename), encryptedPath], {
      timeout: RCLONE_TIMEOUT_MS,
      windowsHide: true,
    });
    await decryptSnapshot(encryptedPath, sqlitePath);
    validateSqliteBackup(sqlitePath);

    fs.mkdirSync(backupDir, { recursive: true });
    fs.copyFileSync(sqlitePath, restorePath);
    const result = await restoreDbBackup(restoreId);
    recordStorageSyncSuccess("restore");
    return {
      restored: true,
      filename,
      backupId: restoreId,
      result,
    };
  } catch (error) {
    recordStorageSyncError(error);
    throw error;
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}
