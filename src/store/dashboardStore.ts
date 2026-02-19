import { create } from 'zustand';
import type { CiStatus, ExecutionStatus, FixRow, TimelineEntry } from '../types/dashboard';

interface DashboardMetadata {
  repoUrl: string;
  teamName: string;
  leaderName: string;
  generatedBranchName: string;
}

interface DashboardExecution {
  status: ExecutionStatus;
  executionTime: number;
  ciStatus: CiStatus;
}

interface DashboardResults {
  failuresCount: number;
  fixesCount: number;
  commitCount: number;
}

interface DashboardData {
  fixesTable: FixRow[];
  timeline: TimelineEntry[];
}

interface DashboardScoring {
  baseScore: number;
  speedBonus: number;
  efficiencyPenalty: number;
  finalScore: number;
}

interface DashboardState {
  metadata: DashboardMetadata;
  execution: DashboardExecution;
  results: DashboardResults;
  data: DashboardData;
  scoring: DashboardScoring;
  inputLocked: boolean;
  errorMessage: string | null;
  setMetadata: (metadata: Partial<DashboardMetadata>) => void;
  setExecution: (execution: Partial<DashboardExecution>) => void;
  setResults: (results: Partial<DashboardResults>) => void;
  setData: (data: Partial<DashboardData>) => void;
  setScoring: (scoring: Partial<DashboardScoring>) => void;
  lockInputs: (locked: boolean) => void;
  setErrorMessage: (message: string | null) => void;
  resetRunData: () => void;
}

const initialState = {
  metadata: {
    repoUrl: '',
    teamName: '',
    leaderName: '',
    generatedBranchName: '',
  },
  execution: {
    status: 'idle' as ExecutionStatus,
    executionTime: 0,
    ciStatus: 'pending' as CiStatus,
  },
  results: {
    failuresCount: 0,
    fixesCount: 0,
    commitCount: 0,
  },
  data: {
    fixesTable: [] as FixRow[],
    timeline: [] as TimelineEntry[],
  },
  scoring: {
    baseScore: 0,
    speedBonus: 0,
    efficiencyPenalty: 0,
    finalScore: 0,
  },
  inputLocked: false,
  errorMessage: null as string | null,
};

export const useDashboardStore = create<DashboardState>((set) => ({
  ...initialState,
  setMetadata: (metadata) =>
    set((state) => ({
      metadata: { ...state.metadata, ...metadata },
    })),
  setExecution: (execution) =>
    set((state) => ({
      execution: { ...state.execution, ...execution },
    })),
  setResults: (results) =>
    set((state) => ({
      results: { ...state.results, ...results },
    })),
  setData: (data) =>
    set((state) => ({
      data: { ...state.data, ...data },
    })),
  setScoring: (scoring) =>
    set((state) => ({
      scoring: { ...state.scoring, ...scoring },
    })),
  lockInputs: (locked) => set({ inputLocked: locked }),
  setErrorMessage: (message) => set({ errorMessage: message }),
  resetRunData: () =>
    set((state) => ({
      ...state,
      execution: initialState.execution,
      results: initialState.results,
      data: initialState.data,
      scoring: initialState.scoring,
      errorMessage: null,
    })),
}));

export const useMetadata = () => useDashboardStore((state) => state.metadata);
export const useExecution = () => useDashboardStore((state) => state.execution);
export const useResults = () => useDashboardStore((state) => state.results);
export const useData = () => useDashboardStore((state) => state.data);
export const useScoring = () => useDashboardStore((state) => state.scoring);
