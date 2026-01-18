/**
 * Expedition Execution Store
 *
 * MobX store for managing expedition path execution.
 * Handles the progression through a confirmed path with proper timing.
 */

import { makeAutoObservable, runInAction } from 'mobx';
import { coordKey } from '../types';
import type { Coord, MapNode, ExecutionState, ActivityType } from '../types';
import { expeditionPathStore } from './expeditionStore';
import { sessionStore } from '../stores/sessionStore';
import { playerStore } from '../stores/playerStore';
import { getActivityReward } from '../data/activities';
import { TICK_MS } from '../data/combat';

/** Activity nodes take an extra tick (1.2s total) */
const ACTIVITY_EXTRA_MS = TICK_MS;

/** Resource earned during execution */
interface ResourceEarned {
  itemId: string;
  count: number;
  coord: Coord;
  timestamp: number;
}

/** Pending minigame info */
interface PendingMinigame {
  activityType: ActivityType;
  coord: Coord;
  baseReward: { itemId: string; count: number };
}

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

  /** Pending minigame waiting to be played (active mode) */
  pendingMinigame: PendingMinigame | null = null;

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
        const key = coordKey(node.coord);
        this.nodeMap.set(key, node);
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
    this.pendingMinigame = null;
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

  /**
   * Complete a minigame and apply the reward multiplier
   * @param rewardMultiplier - 1.5 for perfect, down to 0.7 minimum
   */
  completeMinigame(rewardMultiplier: number) {
    if (this.state !== 'minigame' || !this.pendingMinigame) return;

    const { baseReward, coord } = this.pendingMinigame;

    // Calculate final reward with multiplier
    const finalCount = Math.max(1, Math.round(baseReward.count * rewardMultiplier));

    const earned: ResourceEarned = {
      itemId: baseReward.itemId,
      count: finalCount,
      coord,
      timestamp: Date.now(),
    };

    this.earnedResources.push(earned);
    this.animatingResources.push(earned);
    sessionStore.addToBag(baseReward.itemId, finalCount);

    // Clear pending minigame
    this.pendingMinigame = null;

    // Navigate back to expedition screen
    sessionStore.navigateTo('active-expedition');

    // Resume execution - move to next position and continue
    this.currentIndex++;

    if (this.currentIndex < this.executionPath.length) {
      const nextCoord = this.executionPath[this.currentIndex];
      sessionStore.movePlayer(nextCoord.x, nextCoord.y);
    }

    sessionStore.useAction(1);

    // Check if complete or continue
    if (this.isComplete) {
      this.state = 'completed';
    } else {
      this.state = 'running';
      this.scheduleTick();
    }
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

    const delay = hasActiveActivity ? TICK_MS + ACTIVITY_EXTRA_MS : TICK_MS;

    this.tickTimer = window.setTimeout(() => {
      this.processTick();
    }, delay);
  }

  private processTick() {
    if (this.state !== 'running') return;

    const currentCoord = this.executionPath[this.currentIndex];
    const key = coordKey(currentCoord);
    const node = this.nodeMap.get(key);

    let shouldContinue = true;

    runInAction(() => {
      // Check if there's an active activity at this node
      if (node?.activity && this.activeActivities.has(key)) {
        shouldContinue = this.processActivity(node.activity, currentCoord);
      }

      // If minigame triggered, don't advance - completeMinigame will handle it
      if (!shouldContinue) return;

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

    // If minigame was triggered, don't schedule next tick
    if (!shouldContinue) return;

    // Schedule next tick or complete
    if (this.isComplete) {
      runInAction(() => {
        this.state = 'completed';
      });
    } else {
      this.scheduleTick();
    }
  }

  private processActivity(activityType: string, coord: Coord): boolean {
    // Returns true if execution should continue, false if paused for minigame
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
      return true;
    } else {
      // Active mode - trigger minigame
      const resource = this.getResourceForActivity(activityType);
      if (resource && activityType === 'mining') {
        this.pendingMinigame = {
          activityType: 'mining',
          coord,
          baseReward: resource,
        };
        this.state = 'minigame';
        sessionStore.navigateTo('mining-minigame');
        return false; // Pause execution
      }
      if (resource && activityType === 'herbs') {
        this.pendingMinigame = {
          activityType: 'herbs',
          coord,
          baseReward: resource,
        };
        this.state = 'minigame';
        sessionStore.navigateTo('herbs-minigame');
        return false; // Pause execution
      }
      if (activityType === 'combat') {
        // Combat minigame - reward is gold, handled by the minigame itself
        this.pendingMinigame = {
          activityType: 'combat',
          coord,
          baseReward: { itemId: 'gold', count: 10 }, // Base gold reward
        };
        this.state = 'minigame';
        sessionStore.navigateTo('combat-minigame');
        return false; // Pause execution
      }
      if (resource && activityType === 'fishing') {
        this.pendingMinigame = {
          activityType: 'fishing',
          coord,
          baseReward: resource,
        };
        this.state = 'minigame';
        sessionStore.navigateTo('fishing-minigame');
        return false; // Pause execution
      }
      // For other activities in active mode, auto-collect for now
      if (resource) {
        const earned: ResourceEarned = {
          itemId: resource.itemId,
          count: resource.count,
          coord,
          timestamp: Date.now(),
        };
        this.earnedResources.push(earned);
        this.animatingResources.push(earned);
        sessionStore.addToBag(resource.itemId, resource.count);
      }
      return true;
    }
  }

  private getResourceForActivity(activityType: string): { itemId: string; count: number } | null {
    // Get the current map tier from the expedition
    const mapTier = sessionStore.expedition?.map.tier ?? 1;

    // Use the centralized activity rewards system
    if (['mining', 'herbs', 'gems', 'combat', 'fishing'].includes(activityType)) {
      return getActivityReward(activityType as ActivityType, mapTier);
    }

    return null;
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
