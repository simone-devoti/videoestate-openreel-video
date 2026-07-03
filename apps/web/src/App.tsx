import { useEffect, useLayoutEffect, useCallback, useRef, lazy, Suspense } from "react";
import { ToastContainer } from "./components/Toast";
import { ScriptViewDialog } from "./components/editor/ScriptViewDialog";
import { SearchModal } from "./components/editor/SearchModal";
import { MobileBlocker } from "./components/MobileBlocker";
import { WelcomeScreen } from "./components/welcome";
import { RecoveryDialog } from "./components/welcome/RecoveryDialog";
import { SharePage } from "./pages/SharePage";
import { useUIStore } from "./stores/ui-store";
import { useProjectStore } from "./stores/project-store";
import { useRouter, getMediaUrlFromLocation, pathnameImpliesNewProject } from "./hooks/use-router";
import { useMediaUrlImport } from "./hooks/use-media-url-import";
import { useProjectRecovery } from "./hooks/useProjectRecovery";
import { useKieAIPoller } from "./hooks/useKieAIPoller";
import { useMediaUrlImportStore } from "./stores/media-url-import-store";
import { SOCIAL_MEDIA_PRESETS, type SocialMediaCategory } from "@openreel/core";
import { TooltipProvider, Progress } from "@openreel/ui";
import { Loader2 } from "lucide-react";

const EditorInterface = lazy(() =>
  import("./components/editor/EditorInterface").then((m) => ({
    default: m.EditorInterface,
  }))
);

const LoadingSpinner: React.FC<{ message: string }> = ({ message }) => (
  <div className="h-screen w-screen bg-background flex flex-col items-center justify-center">
    <div className="w-10 h-10 border-2 border-primary border-t-transparent rounded-full animate-spin mb-3" />
    <p className="text-sm text-text-secondary">{message}</p>
  </div>
);

const PRESET_DIMENSIONS: Record<string, SocialMediaCategory> = {
  "1080x1920": "tiktok",
  "1920x1080": "youtube-video",
  "1080x1080": "instagram-post",
  "720x1280": "instagram-stories",
  "1280x720": "youtube-video",
};

function App() {
  const { activeModal, closeModal, skipWelcomeScreen } = useUIStore();
  const { openModal: openSearchModal } = useUIStore();
  const createNewProject = useProjectStore((state) => state.createNewProject);
  const { showDialog, availableSaves, recover, dismiss, clearAll } = useProjectRecovery();

  const { route, params, navigate, parsedDimensions, fps } = useRouter();
  const hasHandledInitialRoute = useRef(false);

  useKieAIPoller();

  useLayoutEffect(() => {
    if (hasHandledInitialRoute.current) return;

    const mediaUrl = params.mediaUrl ?? getMediaUrlFromLocation();
    const wantsNewProject =
      route === "new" ||
      (route === "editor" && pathnameImpliesNewProject());

    if (wantsNewProject) {
      hasHandledInitialRoute.current = true;

      let projectName = "New Project";
      let width = 1920;
      let height = 1080;
      let frameRate = fps;

      if (params.preset) {
        const presetKey = params.preset as SocialMediaCategory;
        const preset = SOCIAL_MEDIA_PRESETS[presetKey];
        if (preset) {
          width = preset.width;
          height = preset.height;
          frameRate = preset.frameRate || fps;
          projectName = `New ${presetKey.charAt(0).toUpperCase() + presetKey.slice(1).replace(/-/g, " ")} Project`;
        }
      } else if (parsedDimensions) {
        width = parsedDimensions.width;
        height = parsedDimensions.height;

        const dimensionKey = `${width}x${height}`;
        const matchingPreset = PRESET_DIMENSIONS[dimensionKey];
        if (matchingPreset) {
          const preset = SOCIAL_MEDIA_PRESETS[matchingPreset];
          frameRate = preset.frameRate || fps;
        }

        const aspectRatio = width / height;
        if (aspectRatio < 1) {
          projectName = "New Vertical Video";
        } else if (aspectRatio > 1) {
          projectName = "New Horizontal Video";
        } else {
          projectName = "New Square Video";
        }
      }

      createNewProject(projectName, { width, height, frameRate });
      navigate(
        "editor",
        mediaUrl ? { mediaUrl } : undefined,
      );
    } else if (
      mediaUrl &&
      ["welcome", "templates", "recent"].includes(route)
    ) {
      hasHandledInitialRoute.current = true;
      createNewProject("New Project");
      navigate("editor", { mediaUrl });
    } else if (route === "editor") {
      hasHandledInitialRoute.current = true;
    } else if (["welcome", "templates", "recent"].includes(route)) {
      hasHandledInitialRoute.current = true;
    }
  }, [
    route,
    params,
    parsedDimensions,
    fps,
    createNewProject,
    navigate,
    skipWelcomeScreen,
  ]);

  useMediaUrlImport(route, params);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape" && route !== "editor") {
        navigate("editor");
      }
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        openSearchModal("search");
      }
    },
    [route, navigate, openSearchModal],
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  const showWelcome =
    ["welcome", "templates", "recent"].includes(route) && !skipWelcomeScreen;
  const initialTab =
    route === "templates"
      ? "templates"
      : route === "recent"
        ? "recent"
        : undefined;
  const isSharePage = route === "share" && params.shareId;
  const mediaUrlImport = useMediaUrlImportStore((state) => ({
    isLoading: state.isLoading,
    progress: state.progress,
    status: state.status,
  }));

  return (
    <TooltipProvider>
      <div className="h-screen w-screen bg-background text-text-primary overflow-hidden">
        <MobileBlocker />
        {isSharePage ? (
          <SharePage shareId={params.shareId!} />
        ) : showWelcome ? (
          <WelcomeScreen initialTab={initialTab} />
        ) : (
          <Suspense fallback={<LoadingSpinner message="Loading editor..." />}>
            <EditorInterface />
          </Suspense>
        )}
        <ToastContainer />
        {mediaUrlImport.isLoading && (
          <div className="fixed inset-0 z-[100] bg-background/80 flex items-center justify-center">
            <div className="bg-background border border-border rounded-lg p-6 w-80 shadow-xl">
              <div className="flex items-center gap-3 mb-4">
                <Loader2 className="w-5 h-5 animate-spin text-primary shrink-0" />
                <span className="text-sm text-text-secondary">
                  {mediaUrlImport.status || "Importing media..."}
                </span>
              </div>
              <Progress value={mediaUrlImport.progress} />
            </div>
          </div>
        )}
        <ScriptViewDialog
          isOpen={activeModal === "scriptView"}
          onClose={closeModal}
        />
        <SearchModal isOpen={activeModal === "search"} onClose={closeModal} />
        {showDialog && availableSaves.length > 0 && (
          <RecoveryDialog
            saves={availableSaves}
            onRecover={async (saveId) => {
              const success = await recover(saveId);
              if (success) navigate("editor");
            }}
            onDismiss={dismiss}
            onClearAll={clearAll}
          />
        )}
      </div>
    </TooltipProvider>
  );
}

export default App;
