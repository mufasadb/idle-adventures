import { describe, it, expect } from 'vitest';
import { calculateAPBreakdown } from '../apBudget';
import { THORNWOOD_MAP, DUSTPEAK_MAP } from '../../data/devMap';
import type { ExpeditionLoadout } from '../../types';

const emptyLoadout: ExpeditionLoadout = {
  vehicle: null,
  food: [null, null, null, null, null, null],
  misc: [null, null, null, null],
  mode: 'active',
};

describe('calculateAPBreakdown', () => {
  it('returns zeros for empty loadout on forest map', () => {
    const r = calculateAPBreakdown(emptyLoadout, THORNWOOD_MAP, 1);
    expect(r).toEqual({ foodAP: 0, animalBonus: 0, mapPenalty: 0, biomeMatchBonus: 0, total: 0 });
  });

  it('sums food AP correctly', () => {
    const loadout: ExpeditionLoadout = {
      ...emptyLoadout,
      food: [{ itemId: 'cooked-bread' }, { itemId: 'cooked-fish' }, null, null, null, null],
    };
    const r = calculateAPBreakdown(loadout, THORNWOOD_MAP, 1);
    expect(r.foodAP).toBe(3); // 2 + 1
    expect(r.total).toBe(3);
  });

  it('calculates animal bonus: tier × beastcraft × 0.5', () => {
    const loadout: ExpeditionLoadout = {
      ...emptyLoadout,
      vehicle: { itemId: 'pack-horse', count: 1 }, // tier 2
    };
    const r = calculateAPBreakdown(loadout, THORNWOOD_MAP, 4); // beastcraft 4
    expect(r.animalBonus).toBe(4); // 2 × 4 × 0.5
    expect(r.total).toBe(4);
  });

  it('applies -5 penalty on desert map without Desert Cloak', () => {
    const loadout: ExpeditionLoadout = {
      ...emptyLoadout,
      food: [{ itemId: 'cooked-bread' }, null, null, null, null, null],
    };
    const r = calculateAPBreakdown(loadout, DUSTPEAK_MAP, 1);
    expect(r.mapPenalty).toBe(5);
    expect(r.total).toBe(-3); // 2 - 5
  });

  it('Desert Cloak cancels desert penalty', () => {
    const loadout: ExpeditionLoadout = {
      ...emptyLoadout,
      food: [{ itemId: 'cooked-bread' }, null, null, null, null, null],
      misc: [{ itemId: 'desert-cloak', count: 1 }, null, null, null],
    };
    const r = calculateAPBreakdown(loadout, DUSTPEAK_MAP, 1);
    expect(r.mapPenalty).toBe(0);
    expect(r.total).toBe(2);
  });
});
