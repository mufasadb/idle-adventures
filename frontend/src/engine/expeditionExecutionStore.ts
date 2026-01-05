/**
 * Expedition Execution Store
 *
 * MobX store for managing expedition path execution.
 * Handles the progression through a confirmed path with proper timing.
 */

import { makeAutoObservable, runInAction } from 'mobx';
import { type Coord, coordKey, type MapNode } from './nodes';
import { expeditionPathStore } from './expeditionStore';
import { sessionStore } from '../stores/sessionStore';
import { playerStore } from '../stores/playerStore';

/** Timing constants (in ms) */
const BASE_TICK_MS = 600;
const ACTIVITY_EXTRA_MS = 600; // Activity nodes take 1.2s total

/** Resource earned during execution */
export interface ResourceEarned {
  itemId: string;
  count: number;
  coord: Coord;
  timestamp: number;
}

/** Execution state */
export type ExecutionState = 'idle' | 'running' | 'paused' | 'completed';

/**
 * Expedition Execution Store
 * Controls the step-by-step execution of a confirmed path
 */
class ExpeditionExecutionStore {
  /** Current execution state */
  state: ExecutionState = 'idle';

  /** The confirmed path being executed */
  executionPath: Coord[] = [];

  /** Set of active activities (copied from path store at confirmation) */
  activeActivities: Set<string> = new Set();

  /** Current index in the path (0 = start position) */
  currentIndex: number = 0;

  /** Resources earned during this execution */
  earnedResources: ResourceEarned[] = [];

  /** Recent resources for animation (cleared after animation completes) */
  animatingResources: ResourceEarned[] = [];

  /** Timer reference for cleanup */
  private tickTimer: number | null = null;

  /** Node map for lookups */
  private nodeMap: Map<string, MapNode> = new Map();

  constructor() {
    makeAutoObservable(this, {
      // Don't make nodeMap observable (internal cache)
    });
  }

  // ============================================
  // Computed Properties
  // ============================================

  /** Current position in the path */
  get currentPosition(): Coord | null {
    if (this.executionPath.length === 0) return null;
    if (this.currentIndex >= this.executionPath.length) {
      return this.executionPath[this.executionPath.length - 1];
    }
    return this.executionPath[this.currentIndex];
  }

  /** Whether we've reached the end of the path */
  get isComplete(): boolean {
    return this.currentIndex >= this.executionPath.length;
  }

  /** Grouped earned resources for the results modal */
  get groupedResources(): Array<{ itemId: string; count: number }> {
    const grouped = new Map<string, number>();
    for (const resource of this.earnedResources) {
      const current = grouped.get(resource.itemId) ?? 0;
      grouped.set(resource.itemId, current + resource.count);
    }
    return Array.from(grouped.entries()).map(([itemId, count]) => ({
      itemId,
      count,
    }));
  }

  /** Progress as percentage (0-100) */
  get progressPercent(): number {
    if (this.executionPath.length === 0) return 0;
    return Math.round((this.currentIndex / this.executionPath.length) * 100);
  }

  // ============================================
  // Actions
  // ============================================

  /**
   * Confirm the current path and start execution
   */
  confirmAndStart() {
    const { affordablePath, activeActivities } = expeditionPathStore;

    if (affordablePath.path.length === 0) return;

    // Copy path and activities
    this.executionPath = [...affordablePath.path];
    this.activeActivities = new Set(activeActivities);

    // Copy node map for lookups
    this.nodeMap.clear();
    const expedition = sessionStore.expedition;
    if (expedition) {
      for (const node of expedition.map.nodes) {
        const key = coordKey({ x: node.x, y: node.y });
        this.nodeMap.set(key, {
          coord: { x: node.x, y: node.y },
          terrain: node.type === 'mountain' ? 'mountain' : 'ground',
          activity: ['mining', 'herbs', 'gems', 'combat'].includes(node.type)
            ? (node.type as 'mining' | 'herbs' | 'gems' | 'combat')
            : undefined,
        });
      }
    }

    // Reset state
    this.currentIndex = 0;
    this.earnedResources = [];
    this.animatingResources = [];
    this.state = 'running';

    // Start the tick loop
    this.scheduleTick();
  }

  /**
   * Pause execution
   */
  pause() {
    if (this.state !== 'running') return;
    this.state = 'paused';
    this.clearTimer();
  }

  /**
   * Resume execution
   */
  resume() {
    if (this.state !== 'paused') return;
    this.state = 'running';
    this.scheduleTick();
  }

  /**
   * Stop execution and reset
   */
  stop() {
    this.clearTimer();
    this.state = 'idle';
    this.executionPath = [];
    this.currentIndex = 0;
    this.earnedResources = [];
    this.animatingResources = [];
  }

  /**
   * Complete the expedition - transfer resources to bank, consume food
   */
  completeExpedition() {
    // Transfer earned resources to player bank
    for (const { itemId, count } of this.groupedResources) {
      playerStore.addToBank(itemId, count);
    }

    // Consume food that was used
    const loadout = sessionStore.loadout;
    for (const slot of loadout.food) {
      if (slot) {
        playerStore.removeFromBank(slot.itemId, 1);
      }
    }

    // Reset execution state
    this.stop();

    // Reset path store
    expeditionPathStore.reset();

    // End expedition and return to town
    sessionStore.endExpedition();
  }

  /**
   * Clear an animating resource (called when animation completes)
   */
  clearAnimatingResource(timestamp: number) {
    this.animatingResources = this.animatingResources.filter(
      r => r.timestamp !== timestamp
    );
  }

  // ============================================
  // Private Methods
  // ============================================

  private scheduleTick() {
    if (this.state !== 'running') return;
    if (this.isComplete) {
      runInAction(() => {
        this.state = 'completed';
      });
      return;
    }

    // Determine delay based on current node
    const currentCoord = this.executionPath[this.currentIndex];
    const key = coordKey(currentCoord);
    const node = this.nodeMap.get(key);
    const hasActiveActivity = node?.activity && this.activeActivities.has(key);

    const delay = hasActiveActivity ? BASE_TICK_MS + ACTIVITY_EXTRA_MS : BASE_TICK_MS;

    this.tickTimer = window.setTimeout(() => {
      this.processTick();
    }, delay);
  }

  private processTick() {
    if (this.state !== 'running') return;

    const currentCoord = this.executionPath[this.currentIndex];
    const key = coordKey(currentCoord);
    const node = this.nodeMap.get(key);

    runInAction(() => {
      // Check if there's an active activity at this node
      if (node?.activity && this.activeActivities.has(key)) {
        this.processActivity(node.activity, currentCoord);
      }

      // Move to next position
      this.currentIndex++;

      // Update player position on map
      if (this.currentIndex < this.executionPath.length) {
        const nextCoord = this.executionPath[this.currentIndex];
        sessionStore.movePlayer(nextCoord.x, nextCoord.y);
      }

      // Use action
      sessionStore.useAction(1);
    });

    // Schedule next tick or complete
    if (this.isComplete) {
      runInAction(() => {
        this.state = 'completed';
      });
    } else {
      this.scheduleTick();
    }
  }

  private processActivity(activityType: string, coord: Coord) {
    // In passive/auto mode, automatically collect resources
    const mode = sessionStore.loadout.mode;

    if (mode === 'passive') {
      // Auto-collect: For now, all mining nodes give iron ore
      // Later this can be expanded based on node type and map
      const resource = this.getResourceForActivity(activityType);
      if (resource) {
        const earned: ResourceEarned = {
          itemId: resource.itemId,
          count: resource.count,
          coord,
          timestamp: Date.now(),
        };
        this.earnedResources.push(earned);
        this.animatingResources.push(earned);

        // Add to expedition bag
        sessionStore.addToBag(resource.itemId, resource.count);
      }
    }
    // In active mode, would trigger minigame (not implemented yet)
  }

  private getResourceForActivity(activityType: string): { itemId: string; count: number } | null {
    // For testing, mining gives 2 iron ore
    // Later this can be based on map tier, player skills, etc.
    switch (activityType) {
      case 'mining':
        return { itemId: 'iron-ore', count: 2 };
      case 'herbs':
        return { itemId: 'alpine-herbs', count: 2 };
      case 'gems':
        return { itemId: 'raw-ruby', count: 1 };
      case 'combat':
        // Combat could give various drops - for now give gold
        return { itemId: 'gold', count: 10 };
      default:
        return null;
    }
  }

  private clearTimer() {
    if (this.tickTimer) {
      clearTimeout(this.tickTimer);
      this.tickTimer = null;
    }
  }
}

export const expeditionExecutionStore = new ExpeditionExecutionStore();

// DEV: Expose for debugging
if (import.meta.env.DEV) {
  (window as unknown as { expeditionExecutionStore: ExpeditionExecutionStore }).expeditionExecutionStore = expeditionExecutionStore;
}
