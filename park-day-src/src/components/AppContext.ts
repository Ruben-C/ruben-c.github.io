import { createContext, useContext } from 'react';
import type { Recommendation } from '../lib/planner';
import type { AppState, PatchItem, Updater } from '../lib/state';

export type TabId = 'now' | 'timeline' | 'rides' | 'shows' | 'food' | 'status';

export interface AppContextValue {
  state: AppState;
  update: Updater;
  patchItem: PatchItem;
  /** Minutes after midnight, Tokyo time (or the simulated clock). */
  now: number;
  rec: Recommendation;
  toast: (message: string) => void;
  setTab: (tab: TabId) => void;
  copy: (text: string, label: string) => void;
  refreshing: boolean;
  doRefresh: () => void;
  /** Jumps to an attraction's detail sheet on the Rides or Shows tab. */
  openItem: (id: string) => void;
}

export const AppContext = createContext<AppContextValue | null>(null);

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('AppCtx missing');
  return ctx;
}
