import type { BusinessLead, ScanParams, ScanProgress } from '../types';

export type ScanSessionStatus = 'running' | 'complete' | 'stopped' | 'error';

export interface ScanSession {
  id: string;
  name: string;
  params: ScanParams;
  results: BusinessLead[];
  progress: ScanProgress;
  status: ScanSessionStatus;
  startedAt: string;
  completedAt: string | null;
}

export interface ScanSessionStore {
  sessions: ScanSession[];
  activeSessionId: string | null;
}

export function emptyScanSessionStore(): ScanSessionStore {
  return { sessions: [], activeSessionId: null };
}
