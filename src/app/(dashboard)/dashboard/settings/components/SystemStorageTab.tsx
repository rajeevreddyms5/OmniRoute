"use client";

import { useState, useEffect, useRef } from "react";
import { Card, Button, Badge } from "@/shared/components";
import { useLocale, useTranslations } from "next-intl";

const rowCountFormatter = new Intl.NumberFormat("en-US");

function formatRows(rows: number | null | undefined) {
  return typeof rows === "number" ? rowCountFormatter.format(rows) : "100K";
}

export default function SystemStorageTab() {
  const [backups, setBackups] = useState([]);
  const [backupsLoading, setBackupsLoading] = useState(false);
  const [backupsExpanded, setBackupsExpanded] = useState(false);
  const [restoreStatus, setRestoreStatus] = useState({ type: "", message: "" });
  const [restoringId, setRestoringId] = useState(null);
  const [confirmRestoreId, setConfirmRestoreId] = useState(null);
  const [manualBackupLoading, setManualBackupLoading] = useState(false);
  const [manualBackupStatus, setManualBackupStatus] = useState({ type: "", message: "" });
  const [exportLoading, setExportLoading] = useState(false);
  const [importLoading, setImportLoading] = useState(false);
  const [importStatus, setImportStatus] = useState({ type: "", message: "" });
  const [confirmImport, setConfirmImport] = useState(false);
  const [pendingImportFile, setPendingImportFile] = useState<File | null>(null);
  const [clearCacheLoading, setClearCacheLoading] = useState(false);
  const [clearCacheStatus, setClearCacheStatus] = useState({ type: "", message: "" });
  const [purgeLogsLoading, setPurgeLogsLoading] = useState(false);
  const [purgeLogsStatus, setPurgeLogsStatus] = useState({ type: "", message: "" });
  const [cleanupBackupsLoading, setCleanupBackupsLoading] = useState(false);
  const [cleanupBackupsStatus, setCleanupBackupsStatus] = useState({ type: "", message: "" });
  const [purgeQuotaSnapshotsLoading, setPurgeQuotaSnapshotsLoading] = useState(false);
  const [purgeQuotaSnapshotsStatus, setPurgeQuotaSnapshotsStatus] = useState({
    type: "",
    message: "",
  });
  const [purgeCallLogsLoading, setPurgeCallLogsLoading] = useState(false);
  const [purgeCallLogsStatus, setPurgeCallLogsStatus] = useState({ type: "", message: "" });
  const [purgeDetailedLogsLoading, setPurgeDetailedLogsLoading] = useState(false);
  const [purgeDetailedLogsStatus, setPurgeDetailedLogsStatus] = useState({ type: "", message: "" });
  const fileInputRef = useRef<HTMLInputElement>(null);
  const jsonInputRef = useRef<HTMLInputElement>(null);
  const locale = useLocale();
  const t = useTranslations("settings");
  const tc = useTranslations("common");
  const [storageHealth, setStorageHealth] = useState({
    driver: "sqlite",
    dbPath: "~/.omniroute/storage.sqlite",
    sizeBytes: 0,
    retentionDays: {
      app: 7,
      call: 7,
    },
    tableMaxRows: {
      callLogs: 100000,
      proxyLogs: 100000,
    },
    backupCount: 0,
    backupRetention: {
      maxFiles: 20,
      days: 0,
    },
    lastBackupAt: null,
  });
  const [backupCleanupOptions, setBackupCleanupOptions] = useState({
    keepLatest: 20,
    retentionDays: 0,
  });
  const [storageSyncStatus, setStorageSyncStatus] = useState({
    settings: {
      enabled: false,
      rcloneRemote: "",
      remotePrefix: "backups",
      keepLatest: 10,
      encryptionMode: "cloud",
      autoUpload: false,
      autoRestore: false,
      autoIntervalMinutes: 60,
      lastUploadAt: null,
      lastRestoreAt: null,
      lastError: null,
    },
    rclone: {
      available: false,
      path: null,
      version: null,
    },
  });
  const [storageSyncForm, setStorageSyncForm] = useState({
    enabled: false,
    rcloneRemote: "",
    remotePrefix: "backups",
    keepLatest: 10,
    encryptionMode: "cloud",
    autoUpload: false,
    autoRestore: false,
    autoIntervalMinutes: 60,
  });
  const [storageSyncLoading, setStorageSyncLoading] = useState(false);
  const [storageSyncAction, setStorageSyncAction] = useState("");
  const [storageSyncMessage, setStorageSyncMessage] = useState({ type: "", message: "" });
  const [remoteSnapshots, setRemoteSnapshots] = useState<any[]>([]);
  const [remoteSnapshotsExpanded, setRemoteSnapshotsExpanded] = useState(false);
  const [confirmRemoteRestore, setConfirmRemoteRestore] = useState("");
  const [storageSyncGuideOpen, setStorageSyncGuideOpen] = useState(false);

  // Database settings state (tasks 23-26)
  const [dbSettings, setDbSettings] = useState<any>(null);
  const [dbSettingsLoading, setDbSettingsLoading] = useState(true);
  const [dbSettingsSaving, setDbSettingsSaving] = useState(false);
  const [dbStatsRefreshing, setDbStatsRefreshing] = useState(false);

  const loadBackups = async () => {
    setBackupsLoading(true);
    try {
      const res = await fetch("/api/db-backups");
      const data = await res.json();
      setBackups(data.backups || []);
    } catch (err) {
      console.error("Failed to fetch backups:", err);
    } finally {
      setBackupsLoading(false);
    }
  };

  const loadStorageHealth = async () => {
    try {
      const res = await fetch("/api/storage/health");
      if (!res.ok) return;
      const data = await res.json();
      setStorageHealth((prev) => ({ ...prev, ...data }));
      setBackupCleanupOptions({
        keepLatest: data.backupRetention?.maxFiles || 20,
        retentionDays: data.backupRetention?.days || 0,
      });
    } catch (err) {
      console.error("Failed to fetch storage health:", err);
    }
  };

  const loadStorageSyncStatus = async () => {
    try {
      const res = await fetch("/api/storage-sync");
      if (!res.ok) return;
      const data = await res.json();
      setStorageSyncStatus(data);
      setStorageSyncForm({
        enabled: data.settings?.enabled === true,
        rcloneRemote: data.settings?.rcloneRemote || "",
        remotePrefix: data.settings?.remotePrefix || "backups",
        keepLatest: data.settings?.keepLatest || 10,
        encryptionMode: data.settings?.encryptionMode || "cloud",
        autoUpload: data.settings?.autoUpload === true,
        autoRestore: data.settings?.autoRestore === true,
        autoIntervalMinutes: data.settings?.autoIntervalMinutes || 60,
      });
    } catch (err) {
      console.error("Failed to fetch storage sync status:", err);
    }
  };

  const loadDatabaseSettings = async () => {
    setDbSettingsLoading(true);
    try {
      const res = await fetch("/api/settings/database");
      if (res.ok) {
        const data = await res.json();
        setDbSettings(data);
      }
    } catch (err) {
      console.error("Failed to load database settings:", err);
    } finally {
      setDbSettingsLoading(false);
    }
  };

  const saveDatabaseSettings = async () => {
    if (!dbSettings) return;
    setDbSettingsSaving(true);
    try {
      const { logs, backup, cache, retention, aggregation, optimization } = dbSettings;
      const res = await fetch("/api/settings/database", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ logs, backup, cache, retention, aggregation, optimization }),
      });
      if (res.ok) {
        await loadDatabaseSettings();
      }
    } catch (err) {
      console.error("Failed to save database settings:", err);
    } finally {
      setDbSettingsSaving(false);
    }
  };

  const refreshDatabaseStats = async () => {
    setDbStatsRefreshing(true);
    try {
      await fetch("/api/settings/database/refresh-stats", { method: "POST" });
      await loadDatabaseSettings();
    } catch (err) {
      console.error("Failed to refresh database stats:", err);
    } finally {
      setDbStatsRefreshing(false);
    }
  };

  const handleCleanupBackups = async () => {
    setCleanupBackupsLoading(true);
    setCleanupBackupsStatus({ type: "", message: "" });
    try {
      const res = await fetch("/api/db-backups", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(backupCleanupOptions),
      });
      const data = await res.json();
      if (res.ok) {
        setCleanupBackupsStatus({
          type: "success",
          message: `Deleted ${data.deletedBackupFamilies} backup set(s) and ${data.deletedFiles} file(s).`,
        });
        await loadStorageHealth();
        if (backupsExpanded) await loadBackups();
      } else {
        setCleanupBackupsStatus({
          type: "error",
          message: data.error || "Failed to clean database backups",
        });
      }
    } catch {
      setCleanupBackupsStatus({ type: "error", message: t("errorOccurred") });
    } finally {
      setCleanupBackupsLoading(false);
    }
  };

  const handleManualBackup = async () => {
    setManualBackupLoading(true);
    setManualBackupStatus({ type: "", message: "" });
    try {
      const res = await fetch("/api/db-backups", { method: "PUT" });
      const data = await res.json();
      if (res.ok) {
        if (data.filename) {
          setManualBackupStatus({
            type: "success",
            message: t("backupCreated", { file: data.filename }),
          });
        } else {
          setManualBackupStatus({
            type: "info",
            message: data.message || t("noChangesSinceBackup"),
          });
        }
        await loadStorageHealth();
        if (backupsExpanded) await loadBackups();
      } else {
        setManualBackupStatus({ type: "error", message: data.error || t("backupFailed") });
      }
    } catch {
      setManualBackupStatus({ type: "error", message: t("errorOccurred") });
    } finally {
      setManualBackupLoading(false);
    }
  };

  const handleRestore = async (backupId) => {
    setRestoringId(backupId);
    setRestoreStatus({ type: "", message: "" });
    try {
      const res = await fetch("/api/db-backups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ backupId }),
      });
      const data = await res.json();
      if (res.ok) {
        setRestoreStatus({
          type: "success",
          message: t("restoreSuccess", {
            connections: data.connectionCount,
            nodes: data.nodeCount,
            combos: data.comboCount,
            apiKeys: data.apiKeyCount,
          }),
        });
        await loadBackups();
        await loadStorageHealth();
      } else {
        setRestoreStatus({ type: "error", message: data.error || t("restoreFailed") });
      }
    } catch {
      setRestoreStatus({ type: "error", message: t("errorDuringRestore") });
    } finally {
      setRestoringId(null);
      setConfirmRestoreId(null);
    }
  };

  useEffect(() => {
    loadStorageHealth();
    loadDatabaseSettings();
    loadStorageSyncStatus();
  }, []);

  const saveStorageSyncSettings = async () => {
    setStorageSyncLoading(true);
    setStorageSyncMessage({ type: "", message: "" });
    try {
      const res = await fetch("/api/storage-sync", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(storageSyncForm),
      });
      const data = await res.json();
      if (res.ok) {
        setStorageSyncStatus((prev) => ({ ...prev, settings: data.settings }));
        setStorageSyncMessage({ type: "success", message: "Storage sync settings saved." });
      } else {
        setStorageSyncMessage({
          type: "error",
          message: data.error?.message || data.error || "Failed to save storage sync settings",
        });
      }
    } catch {
      setStorageSyncMessage({ type: "error", message: t("errorOccurred") });
    } finally {
      setStorageSyncLoading(false);
    }
  };

  const runStorageSyncAction = async (action, filename = undefined) => {
    setStorageSyncAction(action);
    setStorageSyncMessage({ type: "", message: "" });
    try {
      const res = await fetch("/api/storage-sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(filename ? { action, filename } : { action }),
      });
      const data = await res.json();
      if (!res.ok) {
        setStorageSyncMessage({
          type: "error",
          message: data.error?.message || data.error || "Storage sync action failed",
        });
        return;
      }

      if (action === "install-rclone") {
        setStorageSyncMessage({ type: "success", message: "rclone is installed and ready." });
        await loadStorageSyncStatus();
      } else if (action === "upload") {
        setStorageSyncMessage({
          type: "success",
          message: `Uploaded snapshot ${data.filename}.`,
        });
        await loadStorageSyncStatus();
      } else if (action === "list") {
        setRemoteSnapshots(data.snapshots || []);
        setRemoteSnapshotsExpanded(true);
        setStorageSyncMessage({
          type: "success",
          message: `Found ${(data.snapshots || []).length} remote snapshot(s).`,
        });
      } else if (action === "restore") {
        setStorageSyncMessage({
          type: "success",
          message: `Remote snapshot ${filename || "latest.omni-sync"} restored. Reload the dashboard if data looks stale.`,
        });
        await Promise.all([loadStorageHealth(), loadBackups(), loadStorageSyncStatus()]);
      }
    } catch {
      setStorageSyncMessage({ type: "error", message: t("errorOccurred") });
    } finally {
      setStorageSyncAction("");
      setConfirmRemoteRestore("");
    }
  };

  /** Triggers a browser file download from an existing Blob. */
  const triggerDownload = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  /** Fetches a URL, reads the response as a Blob and triggers a download. */
  const fetchAndDownload = async (
    apiUrl: string,
    fallbackFilename: string,
    errorMessage: string
  ) => {
    const res = await fetch(apiUrl);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error((data as { error?: string }).error || errorMessage);
    }
    const blob = await res.blob();
    const disposition = res.headers.get("Content-Disposition") || "";
    const filenameMatch = disposition.match(/filename="?([^"]+)"?/);
    triggerDownload(blob, filenameMatch?.[1] || fallbackFilename);
  };

  const handleExportJson = async () => {
    setExportLoading(true);
    try {
      await fetchAndDownload(
        "/api/settings/export-json",
        `omniroute-legacy-backup-${new Date().toISOString().replace(/[:.]/g, "-")}.json`,
        "JSON Export failed"
      );
    } catch (err) {
      console.error("Export JSON failed:", err);
      setImportStatus({
        type: "error",
        message: t("exportFailedWithError", { error: (err as Error).message }),
      });
    } finally {
      setExportLoading(false);
    }
  };

  const handleImportJsonClick = () => {
    jsonInputRef.current?.click();
  };

  const handleJsonSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.name.endsWith(".json")) {
      setImportStatus({
        type: "error",
        message: "Invalid file type. Only .json allowed.",
      });
      return;
    }

    // Auto import JSON
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        setImportLoading(true);
        const res = await fetch("/api/settings/import-json", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: e.target?.result as string,
        });
        const data = await res.json();
        if (res.ok) {
          setImportStatus({
            type: "success",
            message: data.message || "Legacy JSON imported successfully!",
          });
          await loadStorageHealth();
          if (backupsExpanded) await loadBackups();
        } else {
          setImportStatus({ type: "error", message: data.error || "Failed to import JSON" });
        }
      } catch (err) {
        setImportStatus({ type: "error", message: "Error during JSON import" });
      } finally {
        setImportLoading(false);
        if (jsonInputRef.current) jsonInputRef.current.value = "";
      }
    };
    reader.readAsText(file);
  };

  const handleExport = async () => {
    setExportLoading(true);
    try {
      await fetchAndDownload(
        "/api/db-backups/export",
        `omniroute-backup-${new Date().toISOString().replace(/[:.]/g, "-")}.sqlite`,
        t("exportFailed")
      );
    } catch (err) {
      console.error("Export failed:", err);
      setImportStatus({
        type: "error",
        message: t("exportFailedWithError", { error: (err as Error).message }),
      });
    } finally {
      setExportLoading(false);
    }
  };

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.name.endsWith(".sqlite")) {
      setImportStatus({
        type: "error",
        message: t("invalidFileType"),
      });
      return;
    }
    setPendingImportFile(file);
    setConfirmImport(true);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleImportConfirm = async () => {
    if (!pendingImportFile) return;
    setImportLoading(true);
    setImportStatus({ type: "", message: "" });
    setConfirmImport(false);
    try {
      const arrayBuffer = await pendingImportFile.arrayBuffer();
      const res = await fetch(
        `/api/db-backups/import?filename=${encodeURIComponent(pendingImportFile.name)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/octet-stream" },
          body: arrayBuffer,
        }
      );
      const data = await res.json();
      if (res.ok) {
        setImportStatus({
          type: "success",
          message: t("importSuccess", {
            connections: data.connectionCount,
            nodes: data.nodeCount,
            combos: data.comboCount,
            apiKeys: data.apiKeyCount,
          }),
        });
        await loadStorageHealth();
        if (backupsExpanded) await loadBackups();
      } else {
        setImportStatus({ type: "error", message: data.error || t("importFailed") });
      }
    } catch {
      setImportStatus({ type: "error", message: t("errorDuringImport") });
    } finally {
      setImportLoading(false);
      setPendingImportFile(null);
    }
  };

  const handleImportCancel = () => {
    setConfirmImport(false);
    setPendingImportFile(null);
  };

  const formatBytes = (bytes) => {
    if (!bytes || bytes === 0) return "0 B";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const formatRelativeTime = (isoString) => {
    if (!isoString) return null;
    const now = new Date();
    const then = new Date(isoString);
    const diffMs = (now as any) - (then as any);
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 1) return t("justNow");
    if (diffMin < 60) return t("minutesAgo", { count: diffMin });
    const diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) return t("hoursAgo", { count: diffHr });
    const diffDays = Math.floor(diffHr / 24);
    return t("daysAgo", { count: diffDays });
  };

  const formatBackupReason = (reason) => {
    if (reason === "manual") return t("backupReasonManual");
    if (reason === "pre-restore") return t("backupReasonPreRestore");
    return reason;
  };

  return (
    <Card>
      <div className="flex items-center gap-3 mb-4">
        <div className="p-2 rounded-lg bg-green-500/10 text-green-500">
          <span className="material-symbols-outlined text-[20px]" aria-hidden="true">
            database
          </span>
        </div>
        <div className="flex-1">
          <h3 className="text-lg font-semibold">{t("systemStorage")}</h3>
          <p className="text-xs text-text-muted">{t("allDataLocal")}</p>
        </div>
        <Badge variant="success" size="sm">
          {storageHealth.driver || "json"}
        </Badge>
      </div>

      {/* Storage info grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
        <div className="p-3 rounded-lg bg-bg border border-border">
          <p className="text-[11px] text-text-muted uppercase tracking-wide mb-1">
            {t("databasePath")}
          </p>
          <p className="text-sm font-mono text-text-main break-all">
            {storageHealth.dbPath || "~/.omniroute/storage.sqlite"}
          </p>
        </div>
        <div className="p-3 rounded-lg bg-bg border border-border">
          <p className="text-[11px] text-text-muted uppercase tracking-wide mb-1">
            {t("databaseSize")}
          </p>
          <p className="text-sm font-mono text-text-main">{formatBytes(storageHealth.sizeBytes)}</p>
        </div>
      </div>

      {/* Logs Settings Section */}
      <div className="p-3 rounded-lg bg-bg border border-border mb-4">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <p className="text-sm font-medium text-text-main">Logs Settings</p>
            <p className="text-xs text-text-muted">
              Configure detailed logging and call log pipeline settings
            </p>
          </div>
        </div>
        <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="flex items-center justify-between">
            <label className="text-sm">
              <span className="font-medium">Detailed Logs Enabled</span>
              <p className="text-xs text-text-muted">Enable detailed request/response logging</p>
            </label>
          </div>
          <div className="flex items-center justify-between">
            <label className="text-sm">
              <span className="font-medium">Call Log Pipeline</span>
              <p className="text-xs text-text-muted">Enable call log processing pipeline</p>
            </label>
          </div>
          <div className="flex items-center justify-between">
            <label className="text-sm">
              <span className="font-medium">Max Detail Size (KB)</span>
              <p className="text-xs text-text-muted">Maximum size for detailed log entries</p>
            </label>
          </div>
          <div className="flex items-center justify-between">
            <label className="text-sm">
              <span className="font-medium">Ring Buffer Size</span>
              <p className="text-xs text-text-muted">Size of the ring buffer for logs</p>
            </label>
          </div>
        </div>
      </div>

      {/* Cache Settings Section */}
      <div className="p-3 rounded-lg bg-bg border border-border mb-4">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <p className="text-sm font-medium text-text-main">Cache Settings</p>
            <p className="text-xs text-text-muted">
              Configure semantic and prompt caching behavior
            </p>
          </div>
        </div>
        <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="flex items-center justify-between">
            <label className="text-sm">
              <span className="font-medium">Semantic Cache Enabled</span>
              <p className="text-xs text-text-muted">
                Enable semantic caching for similar requests
              </p>
            </label>
          </div>
          <div className="flex items-center justify-between">
            <label className="text-sm">
              <span className="font-medium">Semantic Cache Max Size</span>
              <p className="text-xs text-text-muted">Maximum number of semantic cache entries</p>
            </label>
          </div>
          <div className="flex items-center justify-between">
            <label className="text-sm">
              <span className="font-medium">Semantic Cache TTL</span>
              <p className="text-xs text-text-muted">
                Time-to-live for semantic cache entries (ms)
              </p>
            </label>
          </div>
          <div className="flex items-center justify-between">
            <label className="text-sm">
              <span className="font-medium">Prompt Cache Enabled</span>
              <p className="text-xs text-text-muted">Enable prompt caching</p>
            </label>
          </div>
          <div className="flex items-center justify-between">
            <label className="text-sm">
              <span className="font-medium">Prompt Cache Strategy</span>
              <p className="text-xs text-text-muted">Strategy for prompt caching</p>
            </label>
          </div>
          <div className="flex items-center justify-between">
            <label className="text-sm">
              <span className="font-medium">Always Preserve Client Cache</span>
              <p className="text-xs text-text-muted">Client cache preservation policy</p>
            </label>
          </div>
        </div>
      </div>

      <div className="p-3 rounded-lg bg-bg border border-border mb-4">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <p className="text-sm font-medium text-text-main">Log retention policy</p>
            <p className="text-xs text-text-muted">
              Request logs retain up to <code>CALL_LOGS_TABLE_MAX_ROWS</code> rows (default:
              100,000). Proxy logs retain up to <code>PROXY_LOGS_TABLE_MAX_ROWS</code> rows. Older
              entries auto-deleted.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="default" size="sm">
              Call {storageHealth.retentionDays.call}d
            </Badge>
            <Badge variant="default" size="sm">
              App {storageHealth.retentionDays.app}d
            </Badge>
            <Badge variant="default" size="sm">
              {formatRows(storageHealth.tableMaxRows?.callLogs)} rows
            </Badge>
          </div>
        </div>
      </div>

      <div className="p-3 rounded-lg bg-bg border border-border mb-4">
        <div className="flex items-start justify-between gap-3 flex-wrap mb-3">
          <div>
            <p className="text-sm font-medium text-text-main">Database backup retention</p>
            <p className="text-xs text-text-muted">
              Automatic SQLite backups are stored in <code>db_backups</code>. Configure how many
              snapshots to keep and optionally delete backups older than N days.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="default" size="sm">
              {storageHealth.backupCount || 0} backups
            </Badge>
            <Badge variant="default" size="sm">
              Max {storageHealth.backupRetention.maxFiles}
            </Badge>
            <Badge variant="default" size="sm">
              {storageHealth.backupRetention.days > 0
                ? `${storageHealth.backupRetention.days}d retention`
                : "Age retention off"}
            </Badge>
          </div>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-xs text-text-muted">
            Keep latest backups
            <input
              type="number"
              min={1}
              max={200}
              value={backupCleanupOptions.keepLatest}
              onChange={(e) => {
                const parsed = Number.parseInt(e.target.value || "1", 10);
                setBackupCleanupOptions((prev) => ({
                  ...prev,
                  keepLatest: Number.isFinite(parsed) ? Math.max(1, parsed) : 1,
                }));
              }}
              className="h-9 w-32 rounded-lg border border-border bg-background px-3 text-sm text-text-main"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-text-muted">
            Delete older than days
            <input
              type="number"
              min={0}
              max={3650}
              value={backupCleanupOptions.retentionDays}
              onChange={(e) => {
                const parsed = Number.parseInt(e.target.value || "0", 10);
                setBackupCleanupOptions((prev) => ({
                  ...prev,
                  retentionDays: Number.isFinite(parsed) ? Math.max(0, parsed) : 0,
                }));
              }}
              className="h-9 w-32 rounded-lg border border-border bg-background px-3 text-sm text-text-main"
            />
          </label>
          <Button
            variant="outline"
            size="sm"
            onClick={handleCleanupBackups}
            loading={cleanupBackupsLoading}
          >
            <span className="material-symbols-outlined text-[14px] mr-1" aria-hidden="true">
              auto_delete
            </span>
            Clean old backups
          </Button>
        </div>
        {cleanupBackupsStatus.message && (
          <div
            className={`mt-3 p-3 rounded-lg text-sm ${
              cleanupBackupsStatus.type === "success"
                ? "bg-green-500/10 text-green-500 border border-green-500/20"
                : "bg-red-500/10 text-red-500 border border-red-500/20"
            }`}
            role="alert"
          >
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-[16px]" aria-hidden="true">
                {cleanupBackupsStatus.type === "success" ? "check_circle" : "error"}
              </span>
              {cleanupBackupsStatus.message}
            </div>
          </div>
        )}
      </div>

      <div className="p-3 rounded-lg bg-bg border border-border mb-4">
        <div className="flex items-start justify-between gap-3 flex-wrap mb-3">
          <div>
            <p className="text-sm font-medium text-text-main">Rclone storage sync</p>
            <p className="text-xs text-text-muted">
              Upload encrypted SQLite snapshots to a configured rclone remote such as Google Drive,
              OneDrive, Dropbox, or WebDAV.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setStorageSyncGuideOpen((open) => !open)}
            >
              <span className="material-symbols-outlined text-[14px] mr-1" aria-hidden="true">
                help
              </span>
              Setup guide
            </Button>
            <Badge variant={storageSyncStatus.rclone.available ? "success" : "warning"} size="sm">
              {storageSyncStatus.rclone.available ? "rclone ready" : "rclone missing"}
            </Badge>
            <Badge variant={storageSyncForm.enabled ? "success" : "default"} size="sm">
              {storageSyncForm.enabled ? "enabled" : "disabled"}
            </Badge>
          </div>
        </div>

        {storageSyncGuideOpen && (
          <div className="mb-3 rounded-lg border border-border bg-background p-3 text-sm text-text-main">
            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <p className="font-medium mb-2">Configure rclone</p>
                <ol className="list-decimal pl-5 space-y-1 text-xs text-text-muted">
                  <li>Install rclone from this panel if it is missing.</li>
                  <li>
                    Open PowerShell and run <code className="font-mono">rclone config</code>.
                  </li>
                  <li>
                    Create a new remote, for example <code className="font-mono">gdrive</code>.
                  </li>
                  <li>Choose Google Drive, Dropbox, OneDrive, or another provider.</li>
                  <li>
                    Finish browser login, then test with{" "}
                    <code className="font-mono">rclone lsd gdrive:</code>.
                  </li>
                </ol>
              </div>
              <div>
                <p className="font-medium mb-2">Use with OmniRoute</p>
                <ol className="list-decimal pl-5 space-y-1 text-xs text-text-muted">
                  <li>
                    Set <span className="text-text-main">Rclone remote</span> to{" "}
                    <code className="font-mono">gdrive:</code>.
                  </li>
                  <li>
                    Set <span className="text-text-main">Remote folder</span> to{" "}
                    <code className="font-mono">OmniRoute/backups</code>.
                  </li>
                  <li>On the main computer, upload a snapshot or enable auto-upload.</li>
                  <li>On another computer, configure the same remote and use Restore latest.</li>
                </ol>
              </div>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
          <label className="flex flex-col gap-1 text-xs text-text-muted md:col-span-2">
            Rclone remote
            <input
              type="text"
              value={storageSyncForm.rcloneRemote}
              placeholder="gdrive:OmniRoute"
              onChange={(e) =>
                setStorageSyncForm((prev) => ({ ...prev, rcloneRemote: e.target.value }))
              }
              className="h-9 rounded-lg border border-border bg-background px-3 text-sm text-text-main"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-text-muted">
            Remote folder
            <input
              type="text"
              value={storageSyncForm.remotePrefix}
              placeholder="backups"
              onChange={(e) =>
                setStorageSyncForm((prev) => ({ ...prev, remotePrefix: e.target.value }))
              }
              className="h-9 rounded-lg border border-border bg-background px-3 text-sm text-text-main"
            />
          </label>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
          <label className="flex flex-col gap-1 text-xs text-text-muted">
            Snapshot encryption
            <select
              value={storageSyncForm.encryptionMode}
              onChange={(e) =>
                setStorageSyncForm((prev) => ({ ...prev, encryptionMode: e.target.value }))
              }
              className="h-9 rounded-lg border border-border bg-background px-3 text-sm text-text-main"
            >
              <option value="cloud">Cloud provider default</option>
              <option value="app">Encrypt before upload</option>
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs text-text-muted">
            Auto-sync interval
            <input
              type="number"
              min={5}
              max={1440}
              value={storageSyncForm.autoIntervalMinutes}
              onChange={(e) => {
                const parsed = Number.parseInt(e.target.value || "60", 10);
                setStorageSyncForm((prev) => ({
                  ...prev,
                  autoIntervalMinutes: Number.isFinite(parsed) ? parsed : 60,
                }));
              }}
              className="h-9 rounded-lg border border-border bg-background px-3 text-sm text-text-main"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-text-muted">
            Stored snapshots
            <input
              type="number"
              min={1}
              max={100}
              value={storageSyncForm.keepLatest}
              onChange={(e) => {
                const parsed = Number.parseInt(e.target.value || "10", 10);
                setStorageSyncForm((prev) => ({
                  ...prev,
                  keepLatest: Number.isFinite(parsed) ? parsed : 10,
                }));
              }}
              className="h-9 rounded-lg border border-border bg-background px-3 text-sm text-text-main"
            />
          </label>
        </div>

        <div className="flex flex-wrap items-center gap-2 mb-3">
          <label className="inline-flex items-center gap-2 text-sm text-text-main mr-2">
            <input
              type="checkbox"
              checked={storageSyncForm.enabled}
              onChange={(e) =>
                setStorageSyncForm((prev) => ({ ...prev, enabled: e.target.checked }))
              }
              className="h-4 w-4 rounded border-border"
            />
            Enable storage sync
          </label>
          <label className="inline-flex items-center gap-2 text-sm text-text-main mr-2">
            <input
              type="checkbox"
              checked={storageSyncForm.autoUpload}
              onChange={(e) =>
                setStorageSyncForm((prev) => ({
                  ...prev,
                  autoUpload: e.target.checked,
                  autoRestore: e.target.checked ? false : prev.autoRestore,
                }))
              }
              className="h-4 w-4 rounded border-border"
            />
            Auto-upload
          </label>
          <label className="inline-flex items-center gap-2 text-sm text-text-main mr-2">
            <input
              type="checkbox"
              checked={storageSyncForm.autoRestore}
              onChange={(e) =>
                setStorageSyncForm((prev) => ({
                  ...prev,
                  autoRestore: e.target.checked,
                  autoUpload: e.target.checked ? false : prev.autoUpload,
                }))
              }
              className="h-4 w-4 rounded border-border"
            />
            Auto-restore newer remote
          </label>
          <Button
            variant="outline"
            size="sm"
            onClick={saveStorageSyncSettings}
            loading={storageSyncLoading}
          >
            <span className="material-symbols-outlined text-[14px] mr-1" aria-hidden="true">
              save
            </span>
            Save
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => runStorageSyncAction("install-rclone")}
            loading={storageSyncAction === "install-rclone"}
          >
            <span className="material-symbols-outlined text-[14px] mr-1" aria-hidden="true">
              download
            </span>
            Install rclone
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => runStorageSyncAction("upload")}
            loading={storageSyncAction === "upload"}
            disabled={!storageSyncStatus.rclone.available || !storageSyncForm.rcloneRemote}
          >
            <span className="material-symbols-outlined text-[14px] mr-1" aria-hidden="true">
              cloud_upload
            </span>
            Upload snapshot
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => runStorageSyncAction("list")}
            loading={storageSyncAction === "list"}
            disabled={!storageSyncStatus.rclone.available || !storageSyncForm.rcloneRemote}
          >
            <span className="material-symbols-outlined text-[14px] mr-1" aria-hidden="true">
              cloud_queue
            </span>
            List remote
          </Button>
          {confirmRemoteRestore === "latest.omni-sync" ? (
            <>
              <Button
                variant="primary"
                size="sm"
                onClick={() => runStorageSyncAction("restore", "latest.omni-sync")}
                loading={storageSyncAction === "restore"}
                disabled={!storageSyncStatus.rclone.available || !storageSyncForm.rcloneRemote}
                className="!bg-amber-500 hover:!bg-amber-600"
              >
                Confirm restore latest
              </Button>
              <Button variant="outline" size="sm" onClick={() => setConfirmRemoteRestore("")}>
                Cancel
              </Button>
            </>
          ) : (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setConfirmRemoteRestore("latest.omni-sync")}
              disabled={!storageSyncStatus.rclone.available || !storageSyncForm.rcloneRemote}
            >
              <span className="material-symbols-outlined text-[14px] mr-1" aria-hidden="true">
                restore
              </span>
              Restore latest
            </Button>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs text-text-muted mb-3">
          <div>
            <span className="font-medium text-text-main">Binary:</span>{" "}
            {storageSyncStatus.rclone.version || "not detected"}
          </div>
          <div>
            <span className="font-medium text-text-main">Last upload:</span>{" "}
            {storageSyncStatus.settings.lastUploadAt
              ? new Date(storageSyncStatus.settings.lastUploadAt).toLocaleString(locale)
              : "never"}
          </div>
          <div>
            <span className="font-medium text-text-main">Last restore:</span>{" "}
            {storageSyncStatus.settings.lastRestoreAt
              ? new Date(storageSyncStatus.settings.lastRestoreAt).toLocaleString(locale)
              : "never"}
          </div>
        </div>

        <div
          className={`p-3 rounded-lg mb-3 text-xs ${
            storageSyncForm.encryptionMode === "app"
              ? "bg-green-500/10 text-green-500 border border-green-500/20"
              : "bg-amber-500/10 text-amber-500 border border-amber-500/20"
          }`}
        >
          {storageSyncForm.encryptionMode === "app"
            ? "Snapshots are encrypted before upload. Other computers need the same storage sync encryption key to restore."
            : "Snapshots rely on the cloud provider's default encryption and may contain provider credentials. Use a private Drive account or enable app encryption."}
        </div>

        {storageSyncMessage.message && (
          <div
            className={`p-3 rounded-lg mb-3 text-sm ${
              storageSyncMessage.type === "success"
                ? "bg-green-500/10 text-green-500 border border-green-500/20"
                : "bg-red-500/10 text-red-500 border border-red-500/20"
            }`}
            role="alert"
          >
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-[16px]" aria-hidden="true">
                {storageSyncMessage.type === "success" ? "check_circle" : "error"}
              </span>
              {storageSyncMessage.message}
            </div>
          </div>
        )}

        {remoteSnapshotsExpanded && (
          <div className="flex flex-col gap-2">
            {remoteSnapshots.length === 0 ? (
              <div className="text-sm text-text-muted p-3 rounded-lg border border-border/50">
                No remote snapshots found.
              </div>
            ) : (
              remoteSnapshots.map((snapshot) => (
                <div
                  key={snapshot.name}
                  className="flex items-center justify-between p-3 rounded-lg bg-black/[0.02] dark:bg-white/[0.02] border border-border/50"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{snapshot.name}</p>
                    <p className="text-xs text-text-muted">
                      {formatBytes(snapshot.size)}
                      {snapshot.modifiedAt
                        ? ` • ${new Date(snapshot.modifiedAt).toLocaleString(locale)}`
                        : ""}
                    </p>
                  </div>
                  {confirmRemoteRestore === snapshot.name ? (
                    <div className="flex items-center gap-2 ml-3">
                      <span className="text-xs text-amber-500 font-medium">Confirm</span>
                      <Button
                        variant="primary"
                        size="sm"
                        onClick={() => runStorageSyncAction("restore", snapshot.name)}
                        loading={storageSyncAction === "restore"}
                        className="!bg-amber-500 hover:!bg-amber-600"
                      >
                        Restore
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setConfirmRemoteRestore("")}
                      >
                        Cancel
                      </Button>
                    </div>
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setConfirmRemoteRestore(snapshot.name)}
                    >
                      <span
                        className="material-symbols-outlined text-[14px] mr-1"
                        aria-hidden="true"
                      >
                        restore
                      </span>
                      Restore
                    </Button>
                  )}
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {/* Export / Import */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <Button variant="outline" size="sm" onClick={handleExport} loading={exportLoading}>
          <span className="material-symbols-outlined text-[14px] mr-1" aria-hidden="true">
            download
          </span>
          {t("exportDatabase")}
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={async () => {
            setExportLoading(true);
            try {
              await fetchAndDownload(
                "/api/db-backups/exportAll",
                "omniroute-full-backup.tar.gz",
                t("exportFailed")
              );
            } catch (err) {
              setImportStatus({
                type: "error",
                message: t("fullExportFailedWithError", { error: (err as Error).message }),
              });
            } finally {
              setExportLoading(false);
            }
          }}
          loading={exportLoading}
        >
          <span className="material-symbols-outlined text-[14px] mr-1" aria-hidden="true">
            folder_zip
          </span>
          {t("exportAll")}
        </Button>
        <Button variant="outline" size="sm" onClick={handleImportClick} loading={importLoading}>
          <span className="material-symbols-outlined text-[14px] mr-1" aria-hidden="true">
            upload
          </span>
          {t("importDatabase")}
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".sqlite"
          className="hidden"
          onChange={handleFileSelected}
        />
        <Button variant="outline" size="sm" onClick={handleExportJson} loading={exportLoading}>
          <span className="material-symbols-outlined text-[14px] mr-1" aria-hidden="true">
            data_object
          </span>
          Export JSON
        </Button>
        <Button variant="outline" size="sm" onClick={handleImportJsonClick} loading={importLoading}>
          <span className="material-symbols-outlined text-[14px] mr-1" aria-hidden="true">
            data_object
          </span>
          Import JSON
        </Button>
        <input
          ref={jsonInputRef}
          type="file"
          accept=".json"
          className="hidden"
          onChange={handleJsonSelected}
        />
      </div>

      {/* Import confirmation dialog */}
      {confirmImport && pendingImportFile && (
        <div className="p-4 rounded-lg mb-4 bg-amber-500/10 border border-amber-500/30">
          <div className="flex items-start gap-3">
            <span
              className="material-symbols-outlined text-[20px] text-amber-500 mt-0.5"
              aria-hidden="true"
            >
              warning
            </span>
            <div className="flex-1">
              <p className="text-sm font-medium text-amber-500 mb-1">{t("confirmDbImport")}</p>
              <p className="text-xs text-text-muted mb-2">
                {t("confirmDbImportDesc", { file: pendingImportFile.name })}
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="primary"
                  size="sm"
                  onClick={handleImportConfirm}
                  className="!bg-amber-500 hover:!bg-amber-600"
                >
                  {t("yesImport")}
                </Button>
                <Button variant="outline" size="sm" onClick={handleImportCancel}>
                  {tc("cancel")}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Import status */}
      {importStatus.message && (
        <div
          className={`p-3 rounded-lg mb-4 text-sm ${
            importStatus.type === "success"
              ? "bg-green-500/10 text-green-500 border border-green-500/20"
              : "bg-red-500/10 text-red-500 border border-red-500/20"
          }`}
          role="alert"
        >
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[16px]" aria-hidden="true">
              {importStatus.type === "success" ? "check_circle" : "error"}
            </span>
            {importStatus.message}
          </div>
        </div>
      )}
      <div className="flex items-center justify-between p-3 rounded-lg bg-bg border border-border mb-4">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-[16px] text-amber-500" aria-hidden="true">
            schedule
          </span>
          <div>
            <p className="text-sm font-medium">{t("lastBackup")}</p>
            <p className="text-xs text-text-muted">
              {storageHealth.lastBackupAt
                ? `${new Date(storageHealth.lastBackupAt).toLocaleString(locale)} (${formatRelativeTime(storageHealth.lastBackupAt)})`
                : t("noBackupYet")}
            </p>
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handleManualBackup}
          loading={manualBackupLoading}
        >
          <span className="material-symbols-outlined text-[14px] mr-1" aria-hidden="true">
            backup
          </span>
          {t("backupNow")}
        </Button>
      </div>

      {manualBackupStatus.message && (
        <div
          className={`p-3 rounded-lg mb-4 text-sm ${
            manualBackupStatus.type === "success"
              ? "bg-green-500/10 text-green-500 border border-green-500/20"
              : manualBackupStatus.type === "info"
                ? "bg-blue-500/10 text-blue-500 border border-blue-500/20"
                : "bg-red-500/10 text-red-500 border border-red-500/20"
          }`}
          role="alert"
        >
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[16px]" aria-hidden="true">
              {manualBackupStatus.type === "success"
                ? "check_circle"
                : manualBackupStatus.type === "info"
                  ? "info"
                  : "error"}
            </span>
            {manualBackupStatus.message}
          </div>
        </div>
      )}

      {/* Maintenance */}
      <div className="pt-3 border-t border-border/50 mb-4">
        <div className="flex items-center gap-2 mb-3">
          <span className="material-symbols-outlined text-[18px] text-blue-500" aria-hidden="true">
            build
          </span>
          <p className="font-medium">{t("maintenance") || "Maintenance"}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <Button
            variant="outline"
            size="sm"
            loading={clearCacheLoading}
            onClick={async () => {
              setClearCacheLoading(true);
              setClearCacheStatus({ type: "", message: "" });
              try {
                const res = await fetch("/api/cache", { method: "DELETE" });
                const data = await res.json();
                if (res.ok) {
                  setClearCacheStatus({
                    type: "success",
                    message: t("cacheCleared") || "Cache cleared successfully",
                  });
                } else {
                  setClearCacheStatus({
                    type: "error",
                    message: data.error || t("clearCacheFailed") || "Failed to clear cache",
                  });
                }
              } catch {
                setClearCacheStatus({ type: "error", message: t("errorOccurred") });
              } finally {
                setClearCacheLoading(false);
              }
            }}
          >
            <span className="material-symbols-outlined text-[14px] mr-1" aria-hidden="true">
              delete_sweep
            </span>
            {t("clearCache") || "Clear Cache"}
          </Button>
          {clearCacheStatus.message && (
            <div
              className={`p-3 rounded-lg text-sm ${
                clearCacheStatus.type === "success"
                  ? "bg-green-500/10 text-green-500 border border-green-500/20"
                  : "bg-red-500/10 text-red-500 border border-red-500/20"
              }`}
              role="alert"
            >
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-[16px]" aria-hidden="true">
                  {clearCacheStatus.type === "success" ? "check_circle" : "error"}
                </span>
                {clearCacheStatus.message}
              </div>
            </div>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            loading={purgeLogsLoading}
            onClick={async () => {
              setPurgeLogsLoading(true);
              setPurgeLogsStatus({ type: "", message: "" });
              try {
                const res = await fetch("/api/settings/purge-logs", { method: "POST" });
                const data = await res.json();
                if (res.ok) {
                  setPurgeLogsStatus({
                    type: "success",
                    message:
                      t("logsDeleted", { count: data.deleted }) ||
                      `Purged ${data.deleted} expired log(s)`,
                  });
                } else {
                  setPurgeLogsStatus({
                    type: "error",
                    message: data.error || t("purgeLogsFailed") || "Failed to purge logs",
                  });
                }
              } catch {
                setPurgeLogsStatus({ type: "error", message: t("errorOccurred") });
              } finally {
                setPurgeLogsLoading(false);
              }
            }}
          >
            <span className="material-symbols-outlined text-[14px] mr-1" aria-hidden="true">
              auto_delete
            </span>
            {t("purgeExpiredLogs") || "Purge Expired Logs"}
          </Button>
          {purgeLogsStatus.message && (
            <div
              className={`p-3 rounded-lg text-sm ${
                purgeLogsStatus.type === "success"
                  ? "bg-green-500/10 text-green-500 border border-green-500/20"
                  : "bg-red-500/10 text-red-500 border border-red-500/20"
              }`}
              role="alert"
            >
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-[16px]" aria-hidden="true">
                  {purgeLogsStatus.type === "success" ? "check_circle" : "error"}
                </span>
                {purgeLogsStatus.message}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Purge Data section */}
      <div className="pt-3 border-t border-border/50">
        <div className="flex items-start justify-between gap-3 flex-wrap mb-3">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span
                className="material-symbols-outlined text-[18px] text-red-500"
                aria-hidden="true"
              >
                delete_forever
              </span>
              <p className="font-medium">Purge Data</p>
            </div>
            <p className="text-xs text-text-muted">
              Immediately delete all records (no retention check). Use with caution.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            loading={purgeQuotaSnapshotsLoading}
            onClick={async () => {
              setPurgeQuotaSnapshotsLoading(true);
              setPurgeQuotaSnapshotsStatus({ type: "", message: "" });
              try {
                const res = await fetch("/api/settings/purge-quota-snapshots", { method: "POST" });
                const data = await res.json();
                if (res.ok) {
                  setPurgeQuotaSnapshotsStatus({
                    type: "success",
                    message: `Purged ${data.deleted} quota snapshots`,
                  });
                } else {
                  setPurgeQuotaSnapshotsStatus({
                    type: "error",
                    message: data.error || "Failed to purge quota snapshots",
                  });
                }
              } catch {
                setPurgeQuotaSnapshotsStatus({ type: "error", message: t("errorOccurred") });
              } finally {
                setPurgeQuotaSnapshotsLoading(false);
              }
            }}
          >
            <span className="material-symbols-outlined text-[14px] mr-1" aria-hidden="true">
              delete_sweep
            </span>
            Purge Quota Snapshots
          </Button>
          <Button
            variant="outline"
            size="sm"
            loading={purgeCallLogsLoading}
            onClick={async () => {
              setPurgeCallLogsLoading(true);
              setPurgeCallLogsStatus({ type: "", message: "" });
              try {
                const res = await fetch("/api/settings/purge-call-logs", { method: "POST" });
                const data = await res.json();
                if (res.ok) {
                  setPurgeCallLogsStatus({
                    type: "success",
                    message: `Purged ${data.deleted} call logs`,
                  });
                } else {
                  setPurgeCallLogsStatus({
                    type: "error",
                    message: data.error || "Failed to purge call logs",
                  });
                }
              } catch {
                setPurgeCallLogsStatus({ type: "error", message: t("errorOccurred") });
              } finally {
                setPurgeCallLogsLoading(false);
              }
            }}
          >
            <span className="material-symbols-outlined text-[14px] mr-1" aria-hidden="true">
              delete_sweep
            </span>
            Purge Call Logs
          </Button>
          <Button
            variant="outline"
            size="sm"
            loading={purgeDetailedLogsLoading}
            onClick={async () => {
              setPurgeDetailedLogsLoading(true);
              setPurgeDetailedLogsStatus({ type: "", message: "" });
              try {
                const res = await fetch("/api/settings/purge-detailed-logs", { method: "POST" });
                const data = await res.json();
                if (res.ok) {
                  setPurgeDetailedLogsStatus({
                    type: "success",
                    message: `Purged ${data.deleted} detailed logs`,
                  });
                } else {
                  setPurgeDetailedLogsStatus({
                    type: "error",
                    message: data.error || "Failed to purge detailed logs",
                  });
                }
              } catch {
                setPurgeDetailedLogsStatus({ type: "error", message: t("errorOccurred") });
              } finally {
                setPurgeDetailedLogsLoading(false);
              }
            }}
          >
            <span className="material-symbols-outlined text-[14px] mr-1" aria-hidden="true">
              delete_sweep
            </span>
            Purge Detailed Logs
          </Button>
        </div>
        {(purgeQuotaSnapshotsStatus.message ||
          purgeCallLogsStatus.message ||
          purgeDetailedLogsStatus.message) && (
          <div className="flex flex-col gap-2 mt-3">
            {purgeQuotaSnapshotsStatus.message && (
              <div
                className={`p-3 rounded-lg text-sm ${
                  purgeQuotaSnapshotsStatus.type === "success"
                    ? "bg-green-500/10 text-green-500 border border-green-500/20"
                    : "bg-red-500/10 text-red-500 border border-red-500/20"
                }`}
                role="alert"
              >
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-[16px]" aria-hidden="true">
                    {purgeQuotaSnapshotsStatus.type === "success" ? "check_circle" : "error"}
                  </span>
                  {purgeQuotaSnapshotsStatus.message}
                </div>
              </div>
            )}
            {purgeCallLogsStatus.message && (
              <div
                className={`p-3 rounded-lg text-sm ${
                  purgeCallLogsStatus.type === "success"
                    ? "bg-green-500/10 text-green-500 border border-green-500/20"
                    : "bg-red-500/10 text-red-500 border border-red-500/20"
                }`}
                role="alert"
              >
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-[16px]" aria-hidden="true">
                    {purgeCallLogsStatus.type === "success" ? "check_circle" : "error"}
                  </span>
                  {purgeCallLogsStatus.message}
                </div>
              </div>
            )}
            {purgeDetailedLogsStatus.message && (
              <div
                className={`p-3 rounded-lg text-sm ${
                  purgeDetailedLogsStatus.type === "success"
                    ? "bg-green-500/10 text-green-500 border border-green-500/20"
                    : "bg-red-500/10 text-red-500 border border-red-500/20"
                }`}
                role="alert"
              >
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-[16px]" aria-hidden="true">
                    {purgeDetailedLogsStatus.type === "success" ? "check_circle" : "error"}
                  </span>
                  {purgeDetailedLogsStatus.message}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Backup/Restore section */}
      <div className="pt-3 border-t border-border/50">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <span
              className="material-symbols-outlined text-[18px] text-amber-500"
              aria-hidden="true"
            >
              restore
            </span>
            <p className="font-medium">{t("backupRestore")}</p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setBackupsExpanded(!backupsExpanded);
              if (!backupsExpanded && backups.length === 0) loadBackups();
            }}
          >
            {backupsExpanded ? t("hide") : t("viewBackups")}
          </Button>
        </div>
        <p className="text-xs text-text-muted mb-3">{t("backupRetentionDesc")}</p>

        {restoreStatus.message && (
          <div
            className={`p-3 rounded-lg mb-3 text-sm ${
              restoreStatus.type === "success"
                ? "bg-green-500/10 text-green-500 border border-green-500/20"
                : "bg-red-500/10 text-red-500 border border-red-500/20"
            }`}
            role="alert"
          >
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-[16px]" aria-hidden="true">
                {restoreStatus.type === "success" ? "check_circle" : "error"}
              </span>
              {restoreStatus.message}
            </div>
          </div>
        )}

        {backupsExpanded && (
          <div className="flex flex-col gap-2">
            {backupsLoading ? (
              <div className="flex items-center justify-center py-6 text-text-muted">
                <span
                  className="material-symbols-outlined animate-spin text-[20px] mr-2"
                  aria-hidden="true"
                >
                  progress_activity
                </span>
                {t("loadingBackups")}
              </div>
            ) : backups.length === 0 ? (
              <div className="text-center py-6 text-text-muted text-sm">
                <span
                  className="material-symbols-outlined text-[32px] mb-2 block opacity-40"
                  aria-hidden="true"
                >
                  folder_off
                </span>
                {t("noBackupsYet")}
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-text-muted">
                    {t("backupsAvailable", { count: backups.length })}
                  </span>
                  <button
                    onClick={loadBackups}
                    className="text-xs text-primary hover:underline flex items-center gap-1"
                  >
                    <span className="material-symbols-outlined text-[14px]" aria-hidden="true">
                      refresh
                    </span>
                    {t("refresh")}
                  </button>
                </div>
                {backups.map((backup) => (
                  <div
                    key={backup.id}
                    className="flex items-center justify-between p-3 rounded-lg bg-black/[0.02] dark:bg-white/[0.02] border border-border/50 hover:border-border transition-colors"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span
                          className="material-symbols-outlined text-[16px] text-amber-500"
                          aria-hidden="true"
                        >
                          description
                        </span>
                        <span className="text-sm font-medium truncate">
                          {new Date(backup.createdAt).toLocaleString(locale)}
                        </span>
                        <Badge
                          variant={
                            backup.reason === "pre-restore"
                              ? "warning"
                              : backup.reason === "manual"
                                ? "success"
                                : "default"
                          }
                          size="sm"
                        >
                          {formatBackupReason(backup.reason)}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-text-muted ml-6">
                        <span>{t("connectionsCount", { count: backup.connectionCount })}</span>
                        <span>•</span>
                        <span>{formatBytes(backup.size)}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 ml-3">
                      {confirmRestoreId === backup.id ? (
                        <>
                          <span className="text-xs text-amber-500 font-medium">{t("confirm")}</span>
                          <Button
                            variant="primary"
                            size="sm"
                            onClick={() => handleRestore(backup.id)}
                            loading={restoringId === backup.id}
                            className="!bg-amber-500 hover:!bg-amber-600"
                          >
                            {t("yes")}
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setConfirmRestoreId(null)}
                          >
                            {t("no")}
                          </Button>
                        </>
                      ) : (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setConfirmRestoreId(backup.id)}
                        >
                          <span
                            className="material-symbols-outlined text-[14px] mr-1"
                            aria-hidden="true"
                          >
                            restore
                          </span>
                          {t("restore")}
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </>
            )}
          </div>
        )}
      </div>

      {/* Task 23: Retention Policy Settings */}
      {!dbSettingsLoading && dbSettings && (
        <div className="mt-6 p-4 rounded-lg border border-border bg-bg">
          <h4 className="text-sm font-semibold mb-3 flex items-center gap-2">
            <span className="material-symbols-outlined text-[18px]" aria-hidden="true">
              schedule
            </span>
            Retention Policy Settings
          </h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-text-muted mb-1">Quota Snapshots (days)</label>
              <input
                type="number"
                min="1"
                max="365"
                value={dbSettings.retention.quotaSnapshots}
                onChange={(e) =>
                  setDbSettings({
                    ...dbSettings,
                    retention: {
                      ...dbSettings.retention,
                      quotaSnapshots: parseInt(e.target.value) || 7,
                    },
                  })
                }
                className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-bg focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
            <div>
              <label className="block text-xs text-text-muted mb-1">
                Compression Analytics (days)
              </label>
              <input
                type="number"
                min="1"
                max="365"
                value={dbSettings.retention.compressionAnalytics}
                onChange={(e) =>
                  setDbSettings({
                    ...dbSettings,
                    retention: {
                      ...dbSettings.retention,
                      compressionAnalytics: parseInt(e.target.value) || 30,
                    },
                  })
                }
                className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-bg focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
            <div>
              <label className="block text-xs text-text-muted mb-1">MCP Audit (days)</label>
              <input
                type="number"
                min="1"
                max="365"
                value={dbSettings.retention.mcpAudit}
                onChange={(e) =>
                  setDbSettings({
                    ...dbSettings,
                    retention: {
                      ...dbSettings.retention,
                      mcpAudit: parseInt(e.target.value) || 30,
                    },
                  })
                }
                className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-bg focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
            <div>
              <label className="block text-xs text-text-muted mb-1">A2A Events (days)</label>
              <input
                type="number"
                min="1"
                max="365"
                value={dbSettings.retention.a2aEvents}
                onChange={(e) =>
                  setDbSettings({
                    ...dbSettings,
                    retention: {
                      ...dbSettings.retention,
                      a2aEvents: parseInt(e.target.value) || 30,
                    },
                  })
                }
                className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-bg focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
            <div>
              <label className="block text-xs text-text-muted mb-1">Call Logs (days)</label>
              <input
                type="number"
                min="1"
                max="365"
                value={dbSettings.retention.callLogs}
                onChange={(e) =>
                  setDbSettings({
                    ...dbSettings,
                    retention: {
                      ...dbSettings.retention,
                      callLogs: parseInt(e.target.value) || 30,
                    },
                  })
                }
                className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-bg focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
            <div>
              <label className="block text-xs text-text-muted mb-1">Usage History (days)</label>
              <input
                type="number"
                min="1"
                max="365"
                value={dbSettings.retention.usageHistory}
                onChange={(e) =>
                  setDbSettings({
                    ...dbSettings,
                    retention: {
                      ...dbSettings.retention,
                      usageHistory: parseInt(e.target.value) || 30,
                    },
                  })
                }
                className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-bg focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
            <div>
              <label className="block text-xs text-text-muted mb-1">Memory Entries (days)</label>
              <input
                type="number"
                min="1"
                max="365"
                value={dbSettings.retention.memoryEntries}
                onChange={(e) =>
                  setDbSettings({
                    ...dbSettings,
                    retention: {
                      ...dbSettings.retention,
                      memoryEntries: parseInt(e.target.value) || 30,
                    },
                  })
                }
                className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-bg focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
          </div>
          <div className="mt-3">
            <Button
              variant="primary"
              size="sm"
              onClick={saveDatabaseSettings}
              loading={dbSettingsSaving}
            >
              Save Retention Settings
            </Button>
          </div>
        </div>
      )}

      {/* Task 24: Compression/Aggregation Settings */}
      {!dbSettingsLoading && dbSettings && (
        <div className="mt-6 p-4 rounded-lg border border-border bg-bg">
          <h4 className="text-sm font-semibold mb-3 flex items-center gap-2">
            <span className="material-symbols-outlined text-[18px]" aria-hidden="true">
              compress
            </span>
            Compression & Aggregation Settings
          </h4>
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                id="aggregation-enabled"
                checked={dbSettings.aggregation.enabled}
                onChange={(e) =>
                  setDbSettings({
                    ...dbSettings,
                    aggregation: { ...dbSettings.aggregation, enabled: e.target.checked },
                  })
                }
                className="w-4 h-4 rounded border-border text-primary focus:ring-2 focus:ring-primary"
              />
              <label htmlFor="aggregation-enabled" className="text-sm">
                Enable Data Aggregation
              </label>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-text-muted mb-1">
                  Raw Data Retention (days)
                </label>
                <input
                  type="number"
                  min="1"
                  max="365"
                  value={dbSettings.aggregation.rawDataRetentionDays}
                  onChange={(e) =>
                    setDbSettings({
                      ...dbSettings,
                      aggregation: {
                        ...dbSettings.aggregation,
                        rawDataRetentionDays: parseInt(e.target.value) || 30,
                      },
                    })
                  }
                  className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-bg focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
              <div>
                <label className="block text-xs text-text-muted mb-1">Granularity</label>
                <select
                  value={dbSettings.aggregation.granularity}
                  onChange={(e) =>
                    setDbSettings({
                      ...dbSettings,
                      aggregation: {
                        ...dbSettings.aggregation,
                        granularity: e.target.value as "hourly" | "daily" | "weekly",
                      },
                    })
                  }
                  className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-bg focus:outline-none focus:ring-2 focus:ring-primary"
                >
                  <option value="hourly">Hourly</option>
                  <option value="daily">Daily</option>
                  <option value="weekly">Weekly</option>
                </select>
              </div>
            </div>
          </div>
          <div className="mt-3">
            <Button
              variant="primary"
              size="sm"
              onClick={saveDatabaseSettings}
              loading={dbSettingsSaving}
            >
              Save Aggregation Settings
            </Button>
          </div>
        </div>
      )}

      {/* Task 25: Optimization Settings */}
      {!dbSettingsLoading && dbSettings && (
        <div className="mt-6 p-4 rounded-lg border border-border bg-bg">
          <h4 className="text-sm font-semibold mb-3 flex items-center gap-2">
            <span className="material-symbols-outlined text-[18px]" aria-hidden="true">
              tune
            </span>
            Optimization Settings
          </h4>
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-text-muted mb-1">Auto Vacuum Mode</label>
                <select
                  value={dbSettings.optimization.autoVacuumMode}
                  onChange={(e) =>
                    setDbSettings({
                      ...dbSettings,
                      optimization: {
                        ...dbSettings.optimization,
                        autoVacuumMode: e.target.value as "NONE" | "FULL" | "INCREMENTAL",
                      },
                    })
                  }
                  className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-bg focus:outline-none focus:ring-2 focus:ring-primary"
                >
                  <option value="NONE">None</option>
                  <option value="FULL">Full</option>
                  <option value="INCREMENTAL">Incremental</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-text-muted mb-1">Scheduled Vacuum</label>
                <select
                  value={dbSettings.optimization.scheduledVacuum}
                  onChange={(e) =>
                    setDbSettings({
                      ...dbSettings,
                      optimization: {
                        ...dbSettings.optimization,
                        scheduledVacuum: e.target.value as "never" | "daily" | "weekly" | "monthly",
                      },
                    })
                  }
                  className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-bg focus:outline-none focus:ring-2 focus:ring-primary"
                >
                  <option value="never">Never</option>
                  <option value="daily">Daily</option>
                  <option value="weekly">Weekly</option>
                  <option value="monthly">Monthly</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-text-muted mb-1">Vacuum Hour (0-23)</label>
                <input
                  type="number"
                  min="0"
                  max="23"
                  value={dbSettings.optimization.vacuumHour}
                  onChange={(e) =>
                    setDbSettings({
                      ...dbSettings,
                      optimization: {
                        ...dbSettings.optimization,
                        vacuumHour: parseInt(e.target.value) || 2,
                      },
                    })
                  }
                  className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-bg focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
              <div>
                <label className="block text-xs text-text-muted mb-1">Page Size (bytes)</label>
                <input
                  type="number"
                  min="512"
                  max="65536"
                  step="512"
                  value={dbSettings.optimization.pageSize}
                  onChange={(e) =>
                    setDbSettings({
                      ...dbSettings,
                      optimization: {
                        ...dbSettings.optimization,
                        pageSize: parseInt(e.target.value) || 4096,
                      },
                    })
                  }
                  className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-bg focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
              <div>
                <label className="block text-xs text-text-muted mb-1">
                  Cache Size (KB, negative = % of RAM)
                </label>
                <input
                  type="number"
                  value={dbSettings.optimization.cacheSize}
                  onChange={(e) =>
                    setDbSettings({
                      ...dbSettings,
                      optimization: {
                        ...dbSettings.optimization,
                        cacheSize: parseInt(e.target.value) || -2000,
                      },
                    })
                  }
                  className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-bg focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
            </div>
            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                id="optimize-on-startup"
                checked={dbSettings.optimization.optimizeOnStartup}
                onChange={(e) =>
                  setDbSettings({
                    ...dbSettings,
                    optimization: {
                      ...dbSettings.optimization,
                      optimizeOnStartup: e.target.checked,
                    },
                  })
                }
                className="w-4 h-4 rounded border-border text-primary focus:ring-2 focus:ring-primary"
              />
              <label htmlFor="optimize-on-startup" className="text-sm">
                Optimize on Startup
              </label>
            </div>
          </div>
          <div className="mt-3">
            <Button
              variant="primary"
              size="sm"
              onClick={saveDatabaseSettings}
              loading={dbSettingsSaving}
            >
              Save Optimization Settings
            </Button>
          </div>
        </div>
      )}

      {/* Task 26: Database Stats Display */}
      {!dbSettingsLoading && dbSettings && dbSettings.stats && (
        <div className="mt-6 p-4 rounded-lg border border-border bg-bg">
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-sm font-semibold flex items-center gap-2">
              <span className="material-symbols-outlined text-[18px]" aria-hidden="true">
                analytics
              </span>
              Database Statistics
            </h4>
            <Button
              variant="outline"
              size="sm"
              onClick={refreshDatabaseStats}
              loading={dbStatsRefreshing}
            >
              <span className="material-symbols-outlined text-[14px] mr-1" aria-hidden="true">
                refresh
              </span>
              Refresh
            </Button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div className="p-3 rounded-lg bg-black/[0.02] dark:bg-white/[0.02]">
              <p className="text-xs text-text-muted mb-1">Database Size</p>
              <p className="text-sm font-semibold">
                {formatBytes(dbSettings.stats.databaseSizeBytes)}
              </p>
            </div>
            <div className="p-3 rounded-lg bg-black/[0.02] dark:bg-white/[0.02]">
              <p className="text-xs text-text-muted mb-1">Page Count</p>
              <p className="text-sm font-semibold">{dbSettings.stats.pageCount.toLocaleString()}</p>
            </div>
            <div className="p-3 rounded-lg bg-black/[0.02] dark:bg-white/[0.02]">
              <p className="text-xs text-text-muted mb-1">Freelist Count</p>
              <p className="text-sm font-semibold">
                {dbSettings.stats.freelistCount.toLocaleString()}
              </p>
            </div>
            <div className="p-3 rounded-lg bg-black/[0.02] dark:bg-white/[0.02]">
              <p className="text-xs text-text-muted mb-1">Last Vacuum</p>
              <p className="text-sm font-semibold">
                {dbSettings.stats.lastVacuumAt
                  ? new Date(dbSettings.stats.lastVacuumAt).toLocaleString(locale)
                  : "Never"}
              </p>
            </div>
            <div className="p-3 rounded-lg bg-black/[0.02] dark:bg-white/[0.02]">
              <p className="text-xs text-text-muted mb-1">Last Optimization</p>
              <p className="text-sm font-semibold">
                {dbSettings.stats.lastOptimizationAt
                  ? new Date(dbSettings.stats.lastOptimizationAt).toLocaleString(locale)
                  : "Never"}
              </p>
            </div>
            <div className="p-3 rounded-lg bg-black/[0.02] dark:bg-white/[0.02]">
              <p className="text-xs text-text-muted mb-1">Integrity Check</p>
              <p className="text-sm font-semibold">
                {dbSettings.stats.integrityCheck === "ok" ? (
                  <span className="text-green-500">✓ OK</span>
                ) : dbSettings.stats.integrityCheck === "error" ? (
                  <span className="text-red-500">✗ Error</span>
                ) : (
                  "Not checked"
                )}
              </p>
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}
