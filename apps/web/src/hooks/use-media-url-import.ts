import { useEffect } from "react";
import {
  clearRouteParam,
  getMediaUrlFromLocation,
  type AppRoute,
  type RouteParams,
} from "./use-router";
import {
  importMediaFromUrl,
  type ImportMediaFromUrlResult,
} from "../utils/import-media-from-url";
import { useMediaUrlImportStore } from "../stores/media-url-import-store";
import { toast } from "../stores/notification-store";

const PENDING_MEDIA_URL_KEY = "openreel.pendingMediaUrl";

/** Deduplicate concurrent imports (e.g. React Strict Mode double mount). */
const importPromises = new Map<string, Promise<ImportMediaFromUrlResult>>();

function stashPendingMediaUrl(url: string): void {
  try {
    sessionStorage.setItem(PENDING_MEDIA_URL_KEY, url);
  } catch {
    // sessionStorage may be unavailable in some contexts
  }
}

function clearPendingMediaUrl(): void {
  try {
    sessionStorage.removeItem(PENDING_MEDIA_URL_KEY);
  } catch {
    // ignore
  }
}

function claimMediaUrl(params: RouteParams): string | null {
  const fromParams = params.mediaUrl?.trim();
  if (fromParams) {
    stashPendingMediaUrl(fromParams);
    return fromParams;
  }

  const fromHash = getMediaUrlFromLocation();
  if (fromHash) {
    stashPendingMediaUrl(fromHash);
    return fromHash;
  }

  try {
    const stored = sessionStorage.getItem(PENDING_MEDIA_URL_KEY);
    return stored?.trim() || null;
  } catch {
    return null;
  }
}

function importOnce(
  mediaUrl: string,
  options: Parameters<typeof importMediaFromUrl>[1],
): Promise<ImportMediaFromUrlResult> {
  const existing = importPromises.get(mediaUrl);
  if (existing) return existing;

  const promise = importMediaFromUrl(mediaUrl, options).finally(() => {
    importPromises.delete(mediaUrl);
  });
  importPromises.set(mediaUrl, promise);
  return promise;
}

/**
 * Import media from a `mediaUrl` hash param once the editor route is active.
 * Runs at App level so it is not tied to EditorInterface mount / engine bridge lifecycle.
 */
export function useMediaUrlImport(route: AppRoute, params: RouteParams): void {
  useEffect(() => {
    if (route !== "editor") return;

    const mediaUrl = claimMediaUrl(params);
    if (!mediaUrl) return;

    let stale = false;

    const run = async () => {
      console.info("[MediaUrlImport] Starting import:", mediaUrl);
      const { setLoading, setProgress, setStatus } =
        useMediaUrlImportStore.getState();
      setLoading(true, 0, "Downloading media...");

      try {
        const result = await importOnce(mediaUrl, {
          onProgress: (loaded, total) => {
            if (stale) return;
            const progress =
              total > 0 ? Math.round((loaded / total) * 100) : 0;
            setProgress(progress);
          },
          onStatus: (status) => {
            if (stale) return;
            setStatus(status);
          },
        });

        if (stale) return;

        clearRouteParam("mediaUrl");
        clearPendingMediaUrl();
        setLoading(false);

        if (result.success) {
          console.info("[MediaUrlImport] Import succeeded:", result.fileName);
          toast.success("Media imported", result.fileName);
        } else {
          console.error("[MediaUrlImport] Import failed:", result.error);
          toast.error("Failed to import media", result.error);
        }
      } catch (error) {
        if (stale) return;

        clearRouteParam("mediaUrl");
        clearPendingMediaUrl();
        useMediaUrlImportStore.getState().setLoading(false);

        const message =
          error instanceof Error ? error.message : "Unknown error";
        console.error("[MediaUrlImport] Import failed:", error);
        toast.error("Failed to import media", message);
      }
    };

    run();

    return () => {
      stale = true;
      // Import continues in the background; a remounted effect awaits the same promise.
    };
  }, [route, params.mediaUrl]);
}
