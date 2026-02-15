import React, { useCallback, useState, useEffect } from "react";
import {
  Search,
  Command,
  ChevronDown,
  FileVideo,
  Film,
  Music,
  Sun,
  Moon,
  SunMoon,
  Loader2,
  X,
  Check,
  FileCode,
  Settings,
  Zap,
  Circle,
  History,
  HelpCircle,
  Diamond,
  Sparkles,
  Play,
} from "lucide-react";
import { useProjectStore } from "../../stores/project-store";
import { useUIStore } from "../../stores/ui-store";
import { useThemeStore } from "../../stores/theme-store";
import {
  getExportEngine,
  downloadBlob,
  getDeviceProfile,
  estimateExportTime,
  type VideoExportSettings,
  type AudioExportSettings,
  type ExportResult,
  type DeviceProfile,
  type TimeEstimate,
} from "@openreel/core";
import { ExportDialog } from "./ExportDialog";
import { ScreenRecorder } from "./ScreenRecorder";
import { HistoryPanel } from "./inspector/HistoryPanel";
import { ProjectSwitcher } from "./ProjectSwitcher";
import { toast } from "../../stores/notification-store";
import { useAnalytics, AnalyticsEvents } from "../../hooks/useAnalytics";
import { startTour, ONBOARDING_KEY, startMoGraphTour, MOGRAPH_TOUR_KEY } from "./tour";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@openreel/ui";

type ExportType =
  | "mp4"
  | "prores"
  | "gif"
  | "wav"
  | "4k-master"
  | "4k-prores"
  | "4k"
  | "1080p-high"
  | "4k-60-master"
  | "1080p-60"
  | "project";

interface ExportState {
  isExporting: boolean;
  progress: number;
  phase: string;
  error: string | null;
  complete: boolean;
}

export const Toolbar: React.FC = () => {
  const { project } = useProjectStore();
  const { openModal, selectedItems, setExportState: setGlobalExportState, keyframeEditorOpen, toggleKeyframeEditor } =
    useUIStore();
  const { mode: themeMode, toggleTheme } = useThemeStore();
  const [isExportOpen, setIsExportOpen] = useState(false);
  const [isExportDialogOpen, setIsExportDialogOpen] = useState(false);
  const [isRecorderOpen, setIsRecorderOpen] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const { importMedia } = useProjectStore();
  const { track } = useAnalytics();

  const handleStartTour = useCallback(() => {
    localStorage.removeItem(ONBOARDING_KEY);
    startTour();
  }, []);

  const handleStartMoGraphTour = useCallback(() => {
    localStorage.removeItem(MOGRAPH_TOUR_KEY);
    startMoGraphTour();
  }, []);

  const hasSelectedClip = selectedItems.some(
    (item) =>
      item.type === "clip" ||
      item.type === "text-clip" ||
      item.type === "shape-clip",
  );
  const [exportState, setExportState] = useState<ExportState>({
    isExporting: false,
    progress: 0,
    phase: "",
    error: null,
    complete: false,
  });
  const [deviceProfile, setDeviceProfile] = useState<DeviceProfile | null>(null);
  const [exportEstimates, setExportEstimates] = useState<Map<string, TimeEstimate>>(new Map());

  useEffect(() => {
    setGlobalExportState({
      isExporting: exportState.isExporting,
      progress: exportState.progress,
      phase: exportState.phase,
    });
  }, [exportState.isExporting, exportState.progress, exportState.phase, setGlobalExportState]);

  useEffect(() => {
    if (isExportOpen && !deviceProfile) {
      getDeviceProfile().then(setDeviceProfile);
    }
  }, [isExportOpen, deviceProfile]);

  useEffect(() => {
    if (!deviceProfile || !project.timeline?.duration) {
      return;
    }

    const duration = project.timeline.duration;
    const estimates = new Map<string, TimeEstimate>();

    const configs: Array<{ key: string; width: number; height: number; frameRate: number; codec: "h264" | "h265" | "vp9" | "av1" }> = [
      { key: "mp4", width: project.settings.width, height: project.settings.height, frameRate: 30, codec: "h264" },
      { key: "4k", width: 3840, height: 2160, frameRate: 30, codec: "h264" },
      { key: "4k-60-master", width: 3840, height: 2160, frameRate: 60, codec: "h264" },
      { key: "4k-master", width: 3840, height: 2160, frameRate: 30, codec: "h264" },
      { key: "1080p-high", width: 1920, height: 1080, frameRate: 30, codec: "h264" },
      { key: "1080p-60", width: 1920, height: 1080, frameRate: 60, codec: "h264" },
      { key: "prores", width: project.settings.width, height: project.settings.height, frameRate: 30, codec: "h264" },
    ];

    for (const config of configs) {
      const estimate = estimateExportTime(deviceProfile, {
        width: config.width,
        height: config.height,
        frameRate: config.frameRate,
        duration,
        codec: config.codec,
      });
      estimates.set(config.key, estimate);
    }

    setExportEstimates(estimates);
  }, [deviceProfile, project.timeline?.duration, project.settings.width, project.settings.height]);

  const handleSearch = useCallback(() => {
    openModal("search");
  }, [openModal]);

  const handleExport = useCallback(
    async (type: ExportType) => {
      setIsExportOpen(false);
      setExportState({
        isExporting: true,
        progress: 0,
        phase: "Initializing...",
        error: null,
        complete: false,
      });

      try {
        const engine = getExportEngine();
        await engine.initialize();

        if (type === "wav") {
          const audioSettings: Partial<AudioExportSettings> = {
            format: "wav",
            sampleRate: 48000,
            channels: 2,
            bitDepth: 24,
          };

          const generator = engine.exportAudio(project, audioSettings);
          let finalResult: ExportResult | undefined;

          while (true) {
            const { value, done } = await generator.next();
            if (done) {
              finalResult = value;
              break;
            }
            setExportState((prev) => ({
              ...prev,
              progress: value.progress * 100,
              phase:
                value.phase === "complete" ? "Complete!" : `${value.phase}...`,
            }));
          }

          if (finalResult?.success && finalResult.blob) {
            downloadBlob(finalResult.blob, `${project.name || "export"}.wav`);
            setExportState((prev) => ({
              ...prev,
              complete: true,
              phase: "Downloaded!",
            }));
            track(AnalyticsEvents.PROJECT_EXPORTED, {
              format: "wav",
              duration: project.timeline?.duration ?? 0,
            });
          } else {
            throw new Error(finalResult?.error?.message || "Export failed");
          }
        } else {
          const getExportSettings = (): Partial<VideoExportSettings> => {
            const base = {
              width: project.settings.width,
              height: project.settings.height,
              frameRate: project.settings.frameRate,
            };

            switch (type) {
              case "project":
                return {
                  ...base,
                  format: "mov",
                  codec: "prores",
                  bitrate: 220000,
                  quality: 100,
                };
              case "4k-60-master":
                return {
                  ...base,
                  width: 3840,
                  height: 2160,
                  frameRate: 60,
                  format: "mov",
                  codec: "h265",
                  bitrate: 100000,
                  quality: 95,
                };
              case "4k-master":
                return {
                  ...base,
                  width: 3840,
                  height: 2160,
                  frameRate: 30,
                  format: "mov",
                  codec: "h265",
                  bitrate: 80000,
                  quality: 95,
                };
              case "4k-prores":
                return {
                  ...base,
                  width: 3840,
                  height: 2160,
                  frameRate: 30,
                  format: "mov",
                  codec: "prores",
                  bitrate: 880000,
                  quality: 100,
                };
              case "4k":
                return {
                  ...base,
                  width: 3840,
                  height: 2160,
                  frameRate: 30,
                  format: "mp4",
                  codec: "h264",
                  bitrate: 50000,
                  quality: 90,
                };
              case "1080p-60":
                return {
                  ...base,
                  width: 1920,
                  height: 1080,
                  frameRate: 60,
                  format: "mp4",
                  codec: "h264",
                  bitrate: 25000,
                  quality: 95,
                };
              case "1080p-high":
                return {
                  ...base,
                  width: 1920,
                  height: 1080,
                  frameRate: 30,
                  format: "mp4",
                  codec: "h264",
                  bitrate: 20000,
                  quality: 95,
                };
              case "prores":
                return {
                  ...base,
                  format: "mov",
                  codec: "prores",
                  bitrate: 220000,
                  quality: 100,
                };
              case "gif":
                return {
                  ...base,
                  format: "webm",
                  codec: "vp9",
                  bitrate: 8000,
                };
              case "mp4":
              default:
                return {
                  ...base,
                  format: "mp4",
                  codec: "h264",
                  bitrate: 12000,
                  quality: 85,
                };
            }
          };

          const videoSettings = getExportSettings();

          const getExtension = () => {
            switch (type) {
              case "4k-60-master":
              case "4k-master":
              case "4k-prores":
              case "prores":
              case "project":
                return "mov";
              case "gif":
                return "webm";
              default:
                return "mp4";
            }
          };

          const getMimeType = () => {
            const ext = getExtension();
            switch (ext) {
              case "mov":
                return "video/quicktime";
              case "webm":
                return "video/webm";
              default:
                return "video/mp4";
            }
          };

          let writableStream: FileSystemWritableFileStream | undefined;
          let useStreaming = false;

          if ("showSaveFilePicker" in window && typeof (window as Window & { showSaveFilePicker?: unknown }).showSaveFilePicker === "function") {
            try {
              const showSaveFilePicker = (window as Window & { showSaveFilePicker: (options: { suggestedName: string; types: Array<{ description: string; accept: Record<string, string[]> }> }) => Promise<FileSystemFileHandle> }).showSaveFilePicker;
              const fileHandle = await showSaveFilePicker({
                suggestedName: `${project.name || "export"}.${getExtension()}`,
                types: [
                  {
                    description: "Video file",
                    accept: { [getMimeType()]: [`.${getExtension()}`] },
                  },
                ],
              });
              writableStream = await fileHandle.createWritable();
              useStreaming = true;
            } catch (e) {
              if ((e as Error).name === "AbortError") {
                setExportState({
                  isExporting: false,
                  progress: 0,
                  phase: "",
                  error: null,
                  complete: false,
                });
                return;
              }
              useStreaming = false;
            }
          }

          const generator = engine.exportVideoWithFFmpeg(project, videoSettings, writableStream);
          let finalResult: ExportResult | undefined;

          while (true) {
            const { value, done } = await generator.next();
            if (done) {
              finalResult = value;
              break;
            }
            setExportState((prev) => ({
              ...prev,
              progress: value.progress * 100,
              phase:
                value.phase === "complete" ? "Complete!" : `${value.phase}...`,
            }));
          }

          if (finalResult?.success) {
            track(AnalyticsEvents.PROJECT_EXPORTED, {
              format: videoSettings.format ?? "mp4",
              codec: videoSettings.codec ?? "h264",
              width: videoSettings.width ?? project.settings.width,
              height: videoSettings.height ?? project.settings.height,
              frameRate: videoSettings.frameRate ?? project.settings.frameRate,
              duration: project.timeline?.duration ?? 0,
              exportType: type,
            });
            if (useStreaming) {
              setExportState((prev) => ({
                ...prev,
                complete: true,
                phase: "Saved!",
              }));
            } else if (finalResult.blob) {
              downloadBlob(
                finalResult.blob,
                `${project.name || "export"}.${getExtension()}`,
              );
              setExportState((prev) => ({
                ...prev,
                complete: true,
                phase: "Downloaded!",
              }));
            } else {
              throw new Error("Export completed but no output generated");
            }
          } else {
            throw new Error(finalResult?.error?.message || "Export failed");
          }
        }

        setTimeout(() => {
          setExportState({
            isExporting: false,
            progress: 0,
            phase: "",
            error: null,
            complete: false,
          });
        }, 2000);
      } catch (error) {
        setExportState((prev) => ({
          ...prev,
          isExporting: false,
          error: error instanceof Error ? error.message : "Export failed",
        }));
      }
    },
    [project, track],
  );

  const handleCancelExport = useCallback(() => {
    const engine = getExportEngine();
    engine.cancel();
    setExportState({
      isExporting: false,
      progress: 0,
      phase: "",
      error: null,
      complete: false,
    });
  }, []);

  const handleCustomExport = useCallback(
    async (settings: VideoExportSettings) => {
      setIsExportDialogOpen(false);
      setExportState({
        isExporting: true,
        progress: 0,
        phase: "Initializing...",
        error: null,
        complete: false,
      });

      try {
        const engine = getExportEngine();
        await engine.initialize();

        const needsUpscaling =
          settings.width > project.settings.width ||
          settings.height > project.settings.height;

        const exportSettings: Partial<VideoExportSettings> = {
          ...settings,
          upscaling:
            settings.upscaling?.enabled && needsUpscaling
              ? settings.upscaling
              : undefined,
        };

        const ext =
          settings.format === "mov"
            ? "mov"
            : settings.format === "webm"
              ? "webm"
              : "mp4";

        const getMimeType = () => {
          switch (ext) {
            case "mov":
              return "video/quicktime";
            case "webm":
              return "video/webm";
            default:
              return "video/mp4";
          }
        };

        let writableStream: FileSystemWritableFileStream | undefined;
        let useStreaming = false;

        if ("showSaveFilePicker" in window && typeof (window as Window & { showSaveFilePicker?: unknown }).showSaveFilePicker === "function") {
          try {
            const showSaveFilePicker = (window as Window & { showSaveFilePicker: (options: { suggestedName: string; types: Array<{ description: string; accept: Record<string, string[]> }> }) => Promise<FileSystemFileHandle> }).showSaveFilePicker;
            const fileHandle = await showSaveFilePicker({
              suggestedName: `${project.name || "export"}.${ext}`,
              types: [
                {
                  description: "Video file",
                  accept: { [getMimeType()]: [`.${ext}`] },
                },
              ],
            });
            writableStream = await fileHandle.createWritable();
            useStreaming = true;
          } catch (e) {
            if ((e as Error).name === "AbortError") {
              setExportState({
                isExporting: false,
                progress: 0,
                phase: "",
                error: null,
                complete: false,
              });
              return;
            }
            useStreaming = false;
          }
        }

        const generator = engine.exportVideoWithFFmpeg(project, exportSettings, writableStream);
        let finalResult: ExportResult | undefined;

        while (true) {
          const { value, done } = await generator.next();
          if (done) {
            finalResult = value;
            break;
          }
          setExportState((prev) => ({
            ...prev,
            progress: value.progress * 100,
            phase:
              value.phase === "complete" ? "Complete!" : `${value.phase}...`,
          }));
        }

        if (finalResult?.success) {
          track(AnalyticsEvents.PROJECT_EXPORTED, {
            format: settings.format,
            codec: settings.codec,
            width: settings.width,
            height: settings.height,
            frameRate: settings.frameRate,
            duration: project.timeline?.duration ?? 0,
            exportType: "custom",
            upscaling: settings.upscaling?.enabled ?? false,
          });
          if (useStreaming) {
            setExportState((prev) => ({
              ...prev,
              complete: true,
              phase: "Saved!",
            }));
          } else if (finalResult.blob) {
            downloadBlob(finalResult.blob, `${project.name || "export"}.${ext}`);
            setExportState((prev) => ({
              ...prev,
              complete: true,
              phase: "Downloaded!",
            }));
          } else {
            throw new Error("Export completed but no output generated");
          }
        } else {
          throw new Error(finalResult?.error?.message || "Export failed");
        }

        setTimeout(() => {
          setExportState({
            isExporting: false,
            progress: 0,
            phase: "",
            error: null,
            complete: false,
          });
        }, 2000);
      } catch (error) {
        setExportState((prev) => ({
          ...prev,
          isExporting: false,
          error: error instanceof Error ? error.message : "Export failed",
        }));
      }
    },
    [project, track],
  );


  const handleRecordingComplete = useCallback(
    async (screenBlob: Blob, webcamBlob?: Blob) => {
      if (!screenBlob || screenBlob.size === 0) {
        toast.error(
          "Recording failed",
          "No video data was captured. Please try again.",
        );
        return;
      }

      const timestamp = new Date()
        .toISOString()
        .slice(0, 19)
        .replace(/[:-]/g, "");
      let importCount = 0;
      const errors: string[] = [];

      const screenFile = new File([screenBlob], `Screen_${timestamp}.webm`, {
        type: screenBlob.type || "video/webm",
      });
      const screenResult = await importMedia(screenFile);
      if (screenResult.success) {
        importCount++;
      } else {
        errors.push(
          screenResult.error?.message || "Failed to import screen recording",
        );
      }

      if (webcamBlob && webcamBlob.size > 0) {
        const webcamFile = new File([webcamBlob], `Webcam_${timestamp}.webm`, {
          type: webcamBlob.type || "video/webm",
        });
        const webcamResult = await importMedia(webcamFile);
        if (webcamResult.success) {
          importCount++;
        } else {
          errors.push(
            webcamResult.error?.message || "Failed to import webcam recording",
          );
        }
      }

      if (importCount > 0) {
        toast.success(
          `${importCount} recording${importCount > 1 ? "s" : ""} imported!`,
          webcamBlob && webcamBlob.size > 0
            ? "Screen and webcam added to assets. Use the timeline to composite them."
            : "Screen recording added to assets.",
        );
      } else if (errors.length > 0) {
        toast.error("Import failed", errors.join(". "));
      }
    },
    [importMedia],
  );

  const projectRes = `${project.settings.width}×${project.settings.height}`;
  const aspectRatio = project.settings.width / project.settings.height;
  const isVertical = aspectRatio < 0.9;
  const isSquare = aspectRatio >= 0.9 && aspectRatio <= 1.1;

  const getRecommendedLabel = () => {
    if (isVertical) return "TikTok / Reels / Shorts";
    if (isSquare) return "Instagram Feed";
    return "YouTube / Social";
  };

  const exportOptions: Array<{
    label: string;
    icon: typeof FileVideo;
    desc: string;
    type: ExportType;
    recommended?: boolean;
    separator?: boolean;
  }> = [
      {
        label: getRecommendedLabel(),
        icon: Zap,
        desc: `${projectRes} H.264 - Best for your video`,
        type: "mp4",
        recommended: true,
      },
      {
        label: "Project Resolution",
        icon: Film,
        desc: `${projectRes} H.264 - High quality`,
        type: "project",
      },
      {
        label: "",
        icon: Film,
        desc: "",
        type: "mp4",
        separator: true,
      },
      ...(isVertical
        ? []
        : [
          {
            label: "4K Standard",
            icon: FileVideo,
            desc: "3840×2160 - YouTube 4K",
            type: "4k" as ExportType,
          },
        ]),
      {
        label: "1080p High Quality",
        icon: FileVideo,
        desc: "1920×1080 30fps - High bitrate",
        type: "1080p-high",
      },
      {
        label: "1080p 60fps",
        icon: FileVideo,
        desc: "1920×1080 - Smooth playback",
        type: "1080p-60",
      },
      {
        label: "MP4 Standard",
        icon: FileVideo,
        desc: `${projectRes} - Web & social`,
        type: "mp4",
      },
      {
        label: "Audio Only (WAV)",
        icon: Music,
        desc: "Uncompressed audio",
        type: "wav",
      },
    ];

  return (
    <div className="h-16 border-b border-border flex items-center px-6 justify-between bg-background shrink-0 z-30 relative">
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 group">
            <svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="500" zoomAndPan="magnify" viewBox="0 0 375 374.999991" height="500" preserveAspectRatio="xMidYMid meet" version="1.0"><defs><clipPath id="54bb3abc63"><path d="M 2 17 L 373 17 L 373 358.945312 L 2 358.945312 Z M 2 17 " clip-rule="nonzero" /></clipPath><clipPath id="bdc29e04f7"><path d="M 79.714844 118.023438 L 294.964844 118.023438 L 294.964844 333.273438 L 79.714844 333.273438 Z M 79.714844 118.023438 " clip-rule="nonzero" /></clipPath></defs><g clip-path="url(#54bb3abc63)"><path fill="#135bf9" d="M 363.816406 149.554688 L 322.445312 117.261719 C 322.449219 117.113281 322.457031 116.96875 322.457031 116.820312 L 322.457031 47.542969 C 322.457031 38.683594 315.273438 31.503906 306.414062 31.503906 L 285.074219 31.503906 C 276.214844 31.503906 269.03125 38.683594 269.03125 47.542969 L 269.03125 75.570312 L 200.78125 22.292969 C 192.96875 16.195312 182.007812 16.195312 174.195312 22.292969 L 11.160156 149.554688 C -5.039062 162.199219 3.902344 188.1875 24.453125 188.1875 L 52.519531 188.1875 L 52.519531 346.503906 C 52.519531 353.296875 58.027344 358.804688 64.824219 358.804688 L 310.152344 358.804688 C 316.945312 358.804688 322.457031 353.296875 322.457031 346.503906 L 322.457031 188.1875 L 350.523438 188.1875 C 371.074219 188.1875 380.015625 162.199219 363.816406 149.554688 Z M 363.816406 149.554688 " fill-opacity="1" fill-rule="nonzero" /></g><g clip-path="url(#bdc29e04f7)"><path fill="#ffffff" d="M 187.5 118.023438 C 128.058594 118.023438 79.738281 166.386719 79.738281 225.828125 C 79.738281 285.269531 128.058594 333.589844 187.5 333.589844 C 246.941406 333.589844 295.261719 285.269531 295.261719 225.828125 C 295.261719 166.386719 246.941406 118.023438 187.5 118.023438 Z M 187.5 316.132812 C 137.710938 316.132812 97.195312 275.613281 97.195312 225.828125 C 97.195312 176.042969 137.710938 135.523438 187.5 135.523438 C 237.285156 135.523438 277.804688 176.042969 277.804688 225.828125 C 277.804688 275.613281 237.285156 316.132812 187.5 316.132812 Z M 187.5 316.132812 " fill-opacity="1" fill-rule="nonzero" /></g><path fill="#ffffff" d="M 235.472656 222.597656 L 159.09375 178.5 C 156.636719 177.078125 153.53125 178.84375 153.53125 181.691406 L 153.53125 269.925781 C 153.53125 272.769531 156.636719 274.539062 159.09375 273.113281 L 235.515625 229.019531 C 237.972656 227.597656 237.972656 224.019531 235.472656 222.597656 Z M 235.472656 222.597656 " fill-opacity="1" fill-rule="nonzero" /></svg>
          </div>
          <span className="text-lg font-medium text-text-primary tracking-wide hidden lg:block">
            <p>VideoEstate.ai</p>
            <p className="text-xs text-text-muted">Editor</p>
          </span>
        </div>
        <div className="h-6 w-px bg-border hidden md:block" />
        <ProjectSwitcher />
      </div>

      <div className="flex-1 max-w-2xl mx-12 relative group">
        <div
          className={`absolute inset-0 bg-primary/20 rounded-xl blur-md transition-opacity duration-300 ${hasSelectedClip
              ? "opacity-100 animate-pulse"
              : "opacity-0 group-hover:opacity-100"
            }`}
        />
        <button
          onClick={handleSearch}
          className={`relative w-full bg-background-secondary border rounded-xl h-10 flex items-center px-4 gap-3 transition-all text-left shadow-inner ${hasSelectedClip
              ? "border-primary/50 ring-1 ring-primary/30"
              : "border-border group-hover:border-primary/50"
            }`}
        >
          <Search
            size={16}
            className={`transition-colors ${hasSelectedClip
                ? "text-primary"
                : "text-text-muted group-hover:text-primary"
              }`}
          />
          <span
            className={`flex-1 text-sm transition-colors ${hasSelectedClip
                ? "text-text-secondary"
                : "text-text-muted group-hover:text-text-secondary"
              }`}
          >
            {hasSelectedClip
              ? "Search effects for selected clip..."
              : "Search tools, effects, or ask AI..."}
          </span>
          <div className="flex items-center gap-1.5 px-2 py-0.5 rounded border border-border bg-background-tertiary">
            <Command size={10} className="text-text-muted" />
            <span className="text-[10px] text-text-muted font-mono">K</span>
          </div>
        </button>
      </div>

      <div className="flex items-center gap-4">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className="p-2 rounded-lg hover:bg-background-elevated text-text-secondary hover:text-text-primary transition-colors"
            >
              <HelpCircle size={16} />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuItem onClick={handleStartTour} className="gap-2">
              <Play size={14} />
              <span>Editor Tour</span>
            </DropdownMenuItem>
            <DropdownMenuItem onClick={handleStartMoGraphTour} className="gap-2">
              <Sparkles size={14} className="text-purple-400" />
              <span>Animation & Effects Tour</span>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="gap-2 text-text-muted">
              <Command size={14} />
              <span>Press ? for shortcuts</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={toggleTheme}
              className="p-2 rounded-lg hover:bg-background-elevated text-text-secondary hover:text-text-primary transition-colors"
            >
              {themeMode === "light" ? (
                <Sun size={16} />
              ) : themeMode === "dark" ? (
                <Moon size={16} />
              ) : (
                <SunMoon size={16} />
              )}
            </button>
          </TooltipTrigger>
          <TooltipContent>
            <p>Theme: {themeMode}</p>
          </TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={() => useUIStore.getState().openModal("scriptView")}
              className="p-2 rounded-lg hover:bg-background-elevated text-text-secondary hover:text-text-primary transition-colors"
            >
              <FileCode size={16} />
            </button>
          </TooltipTrigger>
          <TooltipContent>
            <p>Script View - View/Import JSON</p>
          </TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={toggleKeyframeEditor}
              className={`p-2 rounded-lg transition-colors ${keyframeEditorOpen
                  ? "bg-primary/20 text-primary"
                  : "hover:bg-background-elevated text-text-secondary hover:text-text-primary"
                }`}
            >
              <Diamond size={16} />
            </button>
          </TooltipTrigger>
          <TooltipContent>
            <p>Keyframe Editor</p>
          </TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={() => setIsHistoryOpen(!isHistoryOpen)}
              className={`p-2 rounded-lg transition-colors ${isHistoryOpen
                  ? "bg-primary/20 text-primary"
                  : "hover:bg-background-elevated text-text-secondary hover:text-text-primary"
                }`}
            >
              <History size={16} />
            </button>
          </TooltipTrigger>
          <TooltipContent>
            <p>History - Undo/Redo</p>
          </TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={() => setIsRecorderOpen(true)}
              className="flex items-center gap-2 px-3 py-2 bg-error/10 hover:bg-error/20 text-error rounded-lg transition-colors"
            >
              <Circle size={14} className="fill-current" />
              <span className="text-sm font-medium">Record</span>
            </button>
          </TooltipTrigger>
          <TooltipContent>
            <p>Screen Recording</p>
          </TooltipContent>
        </Tooltip>

        <div className="relative">
          {exportState.isExporting ? (
            <div className="h-10 px-4 bg-background-secondary border border-border rounded-lg flex items-center gap-3 min-w-[200px]">
              <Loader2 size={14} className="text-primary animate-spin" />
              <div className="flex-1">
                <div className="text-[10px] text-text-secondary">
                  {exportState.phase}
                </div>
                <div className="h-1 bg-background-tertiary rounded-full mt-1 overflow-hidden">
                  <div
                    className="h-full bg-primary transition-all duration-200"
                    style={{ width: `${exportState.progress}%` }}
                  />
                </div>
              </div>
              <button
                onClick={handleCancelExport}
                className="p-1 hover:bg-background-tertiary rounded text-text-muted hover:text-error transition-colors"
              >
                <X size={12} />
              </button>
            </div>
          ) : exportState.error ? (
            <div className="h-10 px-4 bg-error/10 border border-error/30 rounded-lg flex items-center gap-2">
              <span className="text-xs text-error">{exportState.error}</span>
              <button
                onClick={() =>
                  setExportState((prev) => ({ ...prev, error: null }))
                }
                className="p-1 hover:bg-error/20 rounded text-error transition-colors"
              >
                <X size={12} />
              </button>
            </div>
          ) : exportState.complete ? (
            <div className="h-10 px-4 bg-primary/10 border border-primary/30 rounded-lg flex items-center gap-2">
              <Check size={14} className="text-primary" />
              <span className="text-xs text-primary">Downloaded!</span>
            </div>
          ) : (
            <DropdownMenu open={isExportOpen} onOpenChange={setIsExportOpen}>
              <DropdownMenuTrigger asChild>
                <button
                  className={`h-10 px-4 bg-primary hover:bg-primary-hover active:bg-primary-active text-white font-bold rounded-lg flex items-center gap-2 transition-all shadow-[0_0_20px_rgba(34,197,94,0.3)] hover:shadow-[0_0_30px_rgba(34,197,94,0.5)] transform hover:-translate-y-0.5 ${isExportOpen ? "translate-y-0 shadow-none" : ""
                    }`}
                >
                  <span className="text-sm tracking-wider">EXPORT</span>
                  <ChevronDown
                    size={14}
                    className={`transition-transform duration-200 ${isExportOpen ? "rotate-180" : ""
                      }`}
                  />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-72 p-0 rounded-xl bg-background-secondary border-border">
                <div className="p-3 space-y-1 max-h-[400px] overflow-y-auto">
                  {exportOptions.map((option, index) =>
                    option.separator ? (
                      <DropdownMenuSeparator key={`sep-${index}`} />
                    ) : (
                      <DropdownMenuItem
                        key={option.type + index}
                        className={`flex items-center gap-3 p-3 rounded-lg cursor-pointer ${option.recommended
                            ? "bg-primary/10 hover:bg-primary/20 border border-primary/30"
                            : ""
                          }`}
                        onClick={() => handleExport(option.type)}
                      >
                        <div
                          className={`p-2 rounded-lg transition-colors ${option.recommended
                              ? "bg-primary/20 text-primary"
                              : "bg-background-tertiary group-hover:bg-background-elevated text-text-secondary group-hover:text-primary"
                            }`}
                        >
                          <option.icon size={18} />
                        </div>
                        <div className="flex-1">
                          <div
                            className={`text-sm font-medium transition-colors ${option.recommended
                                ? "text-primary"
                                : "text-text-primary"
                              }`}
                          >
                            {option.label}
                            {option.recommended && (
                              <span className="ml-2 text-[10px] bg-primary/20 text-primary px-1.5 py-0.5 rounded">
                                Best Match
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-text-muted mt-0.5">
                            {option.desc}
                          </div>
                          {exportEstimates.get(option.type) && (
                            <div className="text-[10px] text-text-secondary mt-1">
                              Est. {exportEstimates.get(option.type)?.formatted}
                            </div>
                          )}
                        </div>
                      </DropdownMenuItem>
                    ),
                  )}

                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    className="flex items-center gap-3 p-3 rounded-lg cursor-pointer"
                    onClick={() => setIsExportDialogOpen(true)}
                  >
                    <div className="p-2 bg-primary/10 rounded-lg text-primary transition-colors">
                      <Settings size={18} />
                    </div>
                    <div className="flex-1">
                      <div className="text-sm font-medium text-primary transition-colors">
                        Custom Export...
                      </div>
                      <div className="text-xs text-text-muted mt-0.5">
                        Full settings with AI upscaling
                      </div>
                    </div>
                    <Settings
                      size={14}
                      className="text-text-muted"
                    />
                  </DropdownMenuItem>
                </div>
                <div className="bg-background-tertiary px-3 py-2.5 text-xs text-center text-text-muted border-t border-border">
                  {project.settings.width}×{project.settings.height} •{" "}
                  {project.settings.frameRate}fps
                </div>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>

      <ExportDialog
        isOpen={isExportDialogOpen}
        onClose={() => setIsExportDialogOpen(false)}
        onExport={handleCustomExport}
        duration={project.timeline?.duration ?? 0}
        projectWidth={project.settings?.width ?? 1920}
        projectHeight={project.settings?.height ?? 1080}
      />

      <ScreenRecorder
        isOpen={isRecorderOpen}
        onClose={() => setIsRecorderOpen(false)}
        onRecordingComplete={handleRecordingComplete}
      />

      {isHistoryOpen && (
        <>
          <div
            className="fixed inset-0 bg-black/20 z-40"
            onClick={() => setIsHistoryOpen(false)}
          />
          <div className="fixed top-16 right-0 bottom-0 w-80 bg-background-secondary border-l border-border z-50 shadow-2xl animate-in slide-in-from-right duration-200">
            <div className="flex items-center justify-between p-3 border-b border-border">
              <span className="text-sm font-medium text-text-primary">Action History</span>
              <button
                onClick={() => setIsHistoryOpen(false)}
                className="p-1.5 rounded hover:bg-background-tertiary text-text-muted hover:text-text-primary transition-colors"
              >
                <X size={14} />
              </button>
            </div>
            <div className="h-[calc(100%-49px)]">
              <HistoryPanel />
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default Toolbar;
