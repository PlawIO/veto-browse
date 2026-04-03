import type { Actors } from '@extension/storage';

export enum TurnStatus {
  ACTIVE = 'active',
  COMPLETE = 'complete',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
}

export interface TurnStep {
  actor: Actors;
  content: string;
  timestamp: number;
  isError: boolean;
}

export interface VetoEvent {
  type: 'blocked' | 'would_block';
  toolName: string;
  reason: string;
  timestamp: number;
}

export interface Turn {
  id: string;
  role: 'user' | 'veto' | 'system';
  content: string;
  timestamp: number;
  status: TurnStatus;
  steps: TurnStep[];
  vetoEvents: VetoEvent[];
  isProgress: boolean;
}
