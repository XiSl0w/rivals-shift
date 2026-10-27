import type { RivalShiftApi } from './types';

declare global {
  interface Window { rivalShift?: RivalShiftApi; }
}

export {};
