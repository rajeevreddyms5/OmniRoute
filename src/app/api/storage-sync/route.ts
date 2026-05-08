import { NextResponse } from "next/server";
import { getStorageSyncSettings, updateStorageSyncSettings } from "@/lib/db/storageSync";
import {
  installPrivateRclone,
  listStorageSnapshots,
  resolveRcloneBinary,
  restoreStorageSnapshot,
  uploadStorageSnapshot,
} from "@/lib/storageSync/rclone";
import { isAuthenticated } from "@/shared/utils/apiAuth";
import { storageSyncActionSchema, storageSyncConfigSchema } from "@/shared/validation/schemas";
import { isValidationFailure, validateBody } from "@/shared/validation/helpers";

function errorResponse(error: unknown, fallback: string, status = 500) {
  const message = error instanceof Error ? error.message : fallback;
  return NextResponse.json({ error: message }, { status });
}

export async function GET(request: Request) {
  if (!(await isAuthenticated(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const [settings, rclone] = await Promise.all([
      Promise.resolve(getStorageSyncSettings()),
      resolveRcloneBinary(),
    ]);

    return NextResponse.json({
      settings,
      rclone,
    });
  } catch (error) {
    return errorResponse(error, "Failed to read storage sync status");
  }
}

export async function PUT(request: Request) {
  if (!(await isAuthenticated(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let rawBody;
  try {
    rawBody = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  try {
    const validation = validateBody(storageSyncConfigSchema, rawBody);
    if (isValidationFailure(validation)) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }

    const settings = updateStorageSyncSettings({
      enabled: validation.data.enabled,
      rcloneRemote: validation.data.rcloneRemote,
      remotePrefix: validation.data.remotePrefix,
      keepLatest: validation.data.keepLatest,
      encryptionMode: validation.data.encryptionMode,
      autoUpload: validation.data.autoUpload,
      autoRestore: validation.data.autoRestore,
      autoIntervalMinutes: validation.data.autoIntervalMinutes,
    });

    return NextResponse.json({ settings });
  } catch (error) {
    return errorResponse(error, "Failed to update storage sync settings");
  }
}

export async function POST(request: Request) {
  if (!(await isAuthenticated(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let rawBody;
  try {
    rawBody = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  try {
    const validation = validateBody(storageSyncActionSchema, rawBody);
    if (isValidationFailure(validation)) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }

    switch (validation.data.action) {
      case "install-rclone": {
        const rclone = await installPrivateRclone();
        return NextResponse.json({ rclone });
      }
      case "upload": {
        const result = await uploadStorageSnapshot();
        return NextResponse.json(result);
      }
      case "list": {
        const snapshots = await listStorageSnapshots();
        return NextResponse.json({ snapshots });
      }
      case "restore": {
        const result = await restoreStorageSnapshot(validation.data.filename || "latest.omni-sync");
        return NextResponse.json(result);
      }
      default:
        return NextResponse.json({ error: "Invalid action" }, { status: 400 });
    }
  } catch (error) {
    return errorResponse(error, "Storage sync action failed");
  }
}
