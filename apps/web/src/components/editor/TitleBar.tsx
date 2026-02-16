import React from "react";
import { useProjectStore } from "../../stores/project-store";

export const TitleBar: React.FC = () => {
  const { project } = useProjectStore();

  // Get active clip name (placeholder for now)
  const activeFileName = project.name;

  return (
    <div className="h-8 bg-reel-dark border-b border-reel-border flex items-center px-4 justify-between shrink-0">
      {/* Window Controls (Mac Style) */}
      <div className="flex gap-2">
        <div className="w-3 h-3 rounded-full bg-[#ff5f57] hover:brightness-90 cursor-pointer" />
        <div className="w-3 h-3 rounded-full bg-[#febc2e] hover:brightness-90 cursor-pointer" />
        <div className="w-3 h-3 rounded-full bg-[#28c840] hover:brightness-90 cursor-pointer" />
      </div>

      {/* Center: App Name and File */}
      <div className="flex gap-2 items-center opacity-0 md:opacity-100">
        <span className="text-acid-green font-bold">OR</span>
        <span className="text-reel-text-secondary">VideoEstate Video Editor</span>
        <span className="mx-2 text-reel-text-secondary">/</span>
        <span className="text-reel-text-primary">{activeFileName}</span>
      </div>

      {/* Spacer */}
      <div className="w-10" />
    </div>
  );
};

export default TitleBar;
