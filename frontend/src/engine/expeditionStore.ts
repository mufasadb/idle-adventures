/**
 * Expedition Store
 *
 * MobX store for managing expedition path state.
 * Delegates calculations to pure functions in pathfinding.ts.
 */

import { makeAutoObservable } from 'mobx';
import { coordKey } from '../types';
import type { Coord, MapNode } from '../types';
import {
  extendPath,
  erasePathTo,
  calculatePathCost,
  trimPathToActionBudget,
  isOnPath,
  type PathCostResult,
  type TrimmedPathResult,
} from './pathfinding';
import { sessionStore } from '../stores/sessionStore';

/**
 * Expedition path and interaction state
 */
class ExpeditionPathStore {
  /** Current planned path (array of coordinates) */
  path: Coord[] = [];

  /** Set of coord keys where activities are "active" (player will use them) */
  activeActivities: Set<string> = new Set();

  /** Map of coord keys to MapNode data */
  private nodeMap: Map<string, MapNode> = new Map();

  /** Starting position for the expedition */
  startPosition: Coord = { x: 0, y: 0 };

  /** Eraser mode - when true, tapping on path erases back to that point */
  eraserMode: boolean = false;

  constructor() {
    makeAutoObservable(this);
  }

  // ============================================
  // Initialization
  // ============================================

  initializeFromSession() {
    const expedition = sessionStore.expedition;
    if (!expedition) return;

    this.nodeMap.clear();
    for (const node of expedition.map.nodes) {
      this.nodeMap.set(coordKey(node.coord), node);
    }

    this.startPosition = { ...expedition.position };
    this.path = [];
    this.activeActivities.clear();
    this.eraserMode = false;
  }

  reset() {
    this.path = [];
    this.activeActivities.clear();
    this.eraserMode = false;
  }

  // ============================================
  // Computed Properties
  // ============================================

  get actionBudget(): number {
    return sessionStore.expedition?.actionsRemaining ?? 0;
  }

  get playerItems(): string[] {
    const items: string[] = [];
    const loadout = sessionStore.loadout;

    if (loadout.vehicle) {
      items.push(loadout.vehicle.itemId);
    }
    for (const misc of loadout.misc) {
      if (misc) {
        items.push(misc.itemId);
      }
    }

    return items;
  }

  get pathCost(): PathCostResult {
    return calculatePathCost(
      this.path,
      this.nodeMap,
      this.activeActivities,
      this.playerItems
    );
  }

  get affordablePath(): TrimmedPathResult {
    return trimPathToActionBudget(
      this.path,
      this.nodeMap,
      this.activeActivities,
      this.actionBudget,
      this.playerItems
    );
  }

  get pathEnd(): Coord | null {
    if (this.path.length === 0) return null;
    return this.path[this.path.length - 1];
  }

  isOnPath(coord: Coord): boolean {
    return isOnPath(this.path, coord);
  }

  isActivityActive(coord: Coord): boolean {
    return this.activeActivities.has(coordKey(coord));
  }

  getNode(coord: Coord): MapNode | undefined {
    return this.nodeMap.get(coordKey(coord));
  }

  get activitiesOnPath(): Coord[] {
    return this.pathCost.activitiesOnPath;
  }

  // ============================================
  // Actions
  // ============================================

  /**
   * Handle a tap on a tile
   * - Normal mode: always extend path to that tile
   * - Eraser mode: if tile is on path, erase back to it; otherwise do nothing
   */
  handleTileTap(coord: Coord) {
    if (this.eraserMode) {
      // Eraser mode: only act if tile is on the path
      if (this.isOnPath(coord)) {
        this.path = erasePathTo(this.path, coord);
        this.cleanupActiveActivities();
      }
      // Do nothing if tile is not on path
      return;
    }

    // Normal mode: extend path to the tapped tile
    this.path = extendPath(this.path, coord, this.startPosition);
    this.autoActivateActivities();
  }

  /**
   * Toggle eraser mode on/off
   */
  toggleEraserMode() {
    this.eraserMode = !this.eraserMode;
  }

  /**
   * Toggle whether an activity is active (used) or skipped
   * Only works for activity nodes that are on the current path
   */
  toggleActivity(coord: Coord) {
    const key = coordKey(coord);
    const node = this.nodeMap.get(key);

    // Only toggle if this is an activity node on the path
    if (!node?.activity) return;
    if (!this.isOnPath(coord)) return;

    if (this.activeActivities.has(key)) {
      this.activeActivities.delete(key);
    } else {
      this.activeActivities.add(key);
    }
  }

  /**
   * Clear the entire path
   */
  clearPath() {
    this.path = [];
    this.activeActivities.clear();
  }

  // ============================================
  // Private Helpers
  // ============================================

  private autoActivateActivities() {
    for (const coord of this.path) {
      const key = coordKey(coord);
      const node = this.nodeMap.get(key);
      if (node?.activity) {
        this.activeActivities.add(key);
      }
    }
  }

  private cleanupActiveActivities() {
    const pathKeys = new Set(this.path.map(coordKey));
    for (const key of this.activeActivities) {
      if (!pathKeys.has(key)) {
        this.activeActivities.delete(key);
      }
    }
  }
}

export const expeditionPathStore = new ExpeditionPathStore();

// DEV: Expose for debugging
if (import.meta.env.DEV) {
  (window as unknown as { expeditionPathStore: ExpeditionPathStore }).expeditionPathStore = expeditionPathStore;
}
