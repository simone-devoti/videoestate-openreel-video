import { create } from "zustand";

interface MediaUrlImportState {
  isLoading: boolean;
  progress: number;
  status: string;
  setLoading: (isLoading: boolean, progress?: number, status?: string) => void;
  setProgress: (progress: number) => void;
  setStatus: (status: string) => void;
}

export const useMediaUrlImportStore = create<MediaUrlImportState>((set) => ({
  isLoading: false,
  progress: 0,
  status: "",
  setLoading: (isLoading, progress = 0, status = "") =>
    set({ isLoading, progress, status }),
  setProgress: (progress) => set({ progress }),
  setStatus: (status) => set({ status }),
}));
