import { useProjectStore } from "../stores/project-store";
import { fetchMediaFromUrl } from "./media-url-loader";

export interface ImportMediaFromUrlOptions {
  onProgress?: (loaded: number, total: number) => void;
  onStatus?: (status: string) => void;
}

export type ImportMediaFromUrlResult =
  | { success: true; mediaId: string; fileName: string }
  | { success: false; error: string };

/**
 * Fetch media from a URL, import it into the media library, and add it to the timeline.
 */
export async function importMediaFromUrl(
  url: string,
  options: ImportMediaFromUrlOptions = {},
): Promise<ImportMediaFromUrlResult> {
  const { onProgress, onStatus } = options;

  try {
    onStatus?.("Downloading media...");
    const { file } = await fetchMediaFromUrl(url, { onProgress });

    onStatus?.("Importing media...");
    const { importMedia, addClipToNewTrack } = useProjectStore.getState();
    const importResult = await importMedia(file);

    if (!importResult.success || !importResult.actionId) {
      return {
        success: false,
        error: importResult.error?.message ?? "Failed to import media",
      };
    }

    onStatus?.("Adding to timeline...");
    const clipResult = await addClipToNewTrack(importResult.actionId);

    if (!clipResult.success) {
      return {
        success: false,
        error: clipResult.error?.message ?? "Failed to add clip to timeline",
      };
    }

    return {
      success: true,
      mediaId: importResult.actionId,
      fileName: file.name,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}
