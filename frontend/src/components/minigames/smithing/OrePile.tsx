/**
 * OrePile Component
 *
 * Displays available ores that can be added to the crucible.
 * Tap an ore to add it.
 */

import { ORE_INFO, type OreType, type SmithingIngredient } from '../../../data/smithing';

interface OrePileProps {
  /** Available ores with counts */
  available: Map<OreType, number>;
  /** Required ingredients for current recipe */
  required: SmithingIngredient[];
  /** Current contents in crucible */
  inCrucible: Map<OreType, number>;
  /** Called when ore is tapped */
  onAddOre: (oreId: OreType) => void;
  /** Whether adding is disabled */
  disabled?: boolean;
}

export function OrePile({
  available,
  required,
  inCrucible,
  onAddOre,
  disabled,
}: OrePileProps) {
  // Get required ore types
  const requiredOres = new Set(required.map((r) => r.oreId));

  // Calculate how many more of each ore is needed
  const getNeeded = (oreId: OreType): number => {
    const req = required.find((r) => r.oreId === oreId);
    if (!req) return 0;
    const have = inCrucible.get(oreId) ?? 0;
    return Math.max(0, req.count - have);
  };

  // Filter to only show required ores
  const oresToShow = Array.from(available.entries()).filter(([oreId]) =>
    requiredOres.has(oreId)
  );

  if (oresToShow.length === 0) {
    return (
      <div className="text-center text-app-muted text-sm p-4">
        No ores available
      </div>
    );
  }

  return (
    <div className="bg-app-secondary rounded-lg p-3">
      <div className="text-xs text-app-muted mb-2 uppercase tracking-wide">
        Ore Pile
      </div>
      <div className="flex flex-wrap gap-2">
        {oresToShow.map(([oreId, count]) => {
          const info = ORE_INFO[oreId];
          const needed = getNeeded(oreId);
          const inCrucibleCount = inCrucible.get(oreId) ?? 0;
          const canAdd = count > 0 && needed > 0 && !disabled;

          return (
            <button
              key={oreId}
              onClick={() => canAdd && onAddOre(oreId)}
              disabled={!canAdd}
              className={`
                relative flex flex-col items-center p-2 rounded-lg min-w-[60px]
                transition-all
                ${canAdd
                  ? 'bg-app-hover hover:bg-accent/20 cursor-pointer'
                  : 'bg-gray-800 opacity-50 cursor-not-allowed'
                }
                ${needed === 0 ? 'ring-2 ring-green-500' : ''}
              `}
            >
              <span className="text-2xl">{info?.icon ?? '?'}</span>
              <span className="text-xs text-app-muted">{info?.name}</span>
              <span className="text-xs font-mono">
                <span className={inCrucibleCount > 0 ? 'text-green-400' : ''}>
                  {inCrucibleCount}
                </span>
                <span className="text-app-muted">/{required.find((r) => r.oreId === oreId)?.count ?? 0}</span>
              </span>

              {/* Available count badge */}
              <div className="absolute -top-1 -right-1 bg-gray-700 text-xs px-1.5 rounded-full">
                {count}
              </div>

              {/* Checkmark when complete */}
              {needed === 0 && (
                <div className="absolute -top-1 -left-1 text-green-400 text-sm">
                  ✓
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
