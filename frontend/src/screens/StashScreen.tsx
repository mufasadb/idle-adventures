import { useCallback, useRef, useState } from 'react';
import { observer } from 'mobx-react-lite';
import { stashStore, type StashItem } from '../stores/stashStore';
import { Header } from '../components/layout';
import { sessionStore } from '../stores/sessionStore';

// ── Category metadata ────────────────────────────────────────────────────────

const CATEGORY_META: Record<string, { label: string; icon: string }> = {
  tool:       { label: 'Tools',           icon: '🔨' },
  food:       { label: 'Food & Rations',  icon: '🍞' },
  map:        { label: 'Maps',            icon: '🗺️' },
  misc:       { label: 'Miscellaneous',   icon: '🎒' },
  ingredient: { label: 'Ingredients',     icon: '🌿' },
  potion:     { label: 'Potions',         icon: '🧪' },
  vehicle:    { label: 'Vehicles',        icon: '🛒' },
  material:   { label: 'Materials',       icon: '🪨' },
  gem:        { label: 'Gems',            icon: '💎' },
};

function getCategoryMeta(category: string) {
  return CATEGORY_META[category] ?? { label: category, icon: '📦' };
}

// ── Tier badge ───────────────────────────────────────────────────────────────

const TIER_COLOURS: Record<number, string> = {
  0: 'bg-gray-500/80 text-gray-100',
  1: 'bg-green-600/80 text-green-100',
  2: 'bg-blue-600/80 text-blue-100',
  3: 'bg-purple-600/80 text-purple-100',
  4: 'bg-yellow-500/80 text-yellow-100',
  5: 'bg-orange-500/80 text-orange-100',
};

function TierBadge({ tier }: { tier?: number }) {
  if (tier === undefined) return null;
  const cls = TIER_COLOURS[tier] ?? 'bg-red-600/80 text-red-100';
  return (
    <span className={`text-[9px] font-bold px-1 py-0.5 rounded ${cls} leading-none`}>
      T{tier}
    </span>
  );
}

// ── Item card ────────────────────────────────────────────────────────────────

interface ItemCardProps {
  item: StashItem;
  isDragging: boolean;
  onPointerDown: (e: React.PointerEvent, item: StashItem) => void;
}

const ItemCard = observer(({ item, isDragging, onPointerDown }: ItemCardProps) => {
  const meta = getCategoryMeta(item.definition.category);
  return (
    <div
      data-stash-item-id={item.id}
      onPointerDown={(e) => onPointerDown(e, item)}
      className={`
        relative bg-app-secondary rounded-xl p-2.5 flex items-center gap-2.5
        select-none cursor-grab active:cursor-grabbing
        transition-all duration-100 border border-app
        ${isDragging ? 'opacity-30 scale-95' : 'hover:border-accent/40'}
      `}
    >
      {/* Item icon */}
      <div className="w-10 h-10 flex items-center justify-center bg-app-tertiary rounded-lg flex-shrink-0 text-2xl">
        {item.definition.icon}
      </div>

      {/* Name + tier */}
      <div className="flex-1 min-w-0">
        <div className="text-app-primary text-xs font-semibold truncate leading-tight">
          {item.definition.name}
        </div>
        <div className="flex items-center gap-1.5 mt-1">
          <span className="text-[10px] text-app-muted">{meta.icon} {meta.label}</span>
          <TierBadge tier={item.definition.tier} />
        </div>
      </div>

      {/* Quantity */}
      {item.quantity > 1 && (
        <div className="flex-shrink-0 text-accent font-bold text-sm">
          ×{item.quantity}
        </div>
      )}
    </div>
  );
});

// ── Category section ─────────────────────────────────────────────────────────

interface CategorySectionProps {
  category: string;
  items: StashItem[];
  draggingItemId: string | null;
  onPointerDown: (e: React.PointerEvent, item: StashItem) => void;
}

const CategorySection = observer(({ category, items, draggingItemId, onPointerDown }: CategorySectionProps) => {
  const meta = getCategoryMeta(category);
  return (
    <div>
      {/* Category header */}
      <div className="flex items-center gap-2 mb-2">
        <span className="text-base">{meta.icon}</span>
        <span className="text-app-primary text-xs font-bold uppercase tracking-widest">
          {meta.label}
        </span>
        <span className="text-app-muted text-xs ml-auto">{items.length}</span>
      </div>

      {/* Item cards: 1-column list */}
      <div className="space-y-2">
        {items.map((item) => (
          <ItemCard
            key={item.id}
            item={item}
            isDragging={draggingItemId === item.id}
            onPointerDown={onPointerDown}
          />
        ))}
      </div>
    </div>
  );
});

// ── Drag ghost ───────────────────────────────────────────────────────────────

interface DragGhostProps {
  item: StashItem;
  x: number;
  y: number;
}

const DragGhost = ({ item, x, y }: DragGhostProps) => (
  <div
    className="fixed z-50 pointer-events-none"
    style={{ left: x - 32, top: y - 32, width: 64, height: 64 }}
  >
    <div className="w-full h-full rounded-xl bg-app-secondary border-2 border-accent shadow-xl opacity-95 flex items-center justify-center">
      <span className="text-2xl">{item.definition.icon}</span>
      {item.quantity > 1 && (
        <span className="absolute bottom-0.5 right-1 text-[10px] font-bold text-accent">
          ×{item.quantity}
        </span>
      )}
    </div>
  </div>
);

// ── Main screen ──────────────────────────────────────────────────────────────

export const StashScreen = observer(() => {
  const [dragState, setDragState] = useState<{
    item: StashItem;
    x: number;
    y: number;
  } | null>(null);

  const dragStateRef = useRef(dragState);
  dragStateRef.current = dragState;

  const handlePointerMove = useCallback((e: PointerEvent) => {
    if (!dragStateRef.current) return;
    setDragState((prev) => prev ? { ...prev, x: e.clientX, y: e.clientY } : null);
  }, []);

  const handlePointerUp = useCallback(() => {
    // Any drop outside a recognised target → item returns to stash with no state change
    document.removeEventListener('pointermove', handlePointerMove);
    document.removeEventListener('pointerup', handlePointerUp);
    setDragState(null);
  }, [handlePointerMove]);

  const handlePointerDown = useCallback((e: React.PointerEvent, item: StashItem) => {
    e.preventDefault();
    setDragState({ item, x: e.clientX, y: e.clientY });
    document.addEventListener('pointermove', handlePointerMove);
    document.addEventListener('pointerup', handlePointerUp);
  }, [handlePointerMove, handlePointerUp]);

  return (
    <div className="flex flex-col h-full bg-app-primary">
      <Header
        title="Stash"
        showBack
        onBack={() => sessionStore.navigateTo('town')}
      />

      <div className="flex-1 overflow-y-auto p-4 space-y-5">
        {/* Item count summary */}
        <div className="text-app-muted text-xs text-right">
          {stashStore.itemCount} item{stashStore.itemCount !== 1 ? 's' : ''} in stash
        </div>

        {stashStore.itemCount === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <span className="text-5xl mb-3">📦</span>
            <div className="text-app-primary font-medium text-sm">Stash is empty</div>
            <div className="text-app-muted text-xs mt-1">
              Items you gather on expeditions will appear here.
            </div>
          </div>
        ) : (
          /* Category sections */
          stashStore.categories.map((category) => (
            <CategorySection
              key={category}
              category={category}
              items={stashStore.getByCategory(category)}
              draggingItemId={dragState?.item.id ?? null}
              onPointerDown={handlePointerDown}
            />
          ))
        )}

        {stashStore.error && (
          <div className="text-yellow-400 text-xs text-center py-2 bg-yellow-400/10 rounded-lg">
            {stashStore.error}
          </div>
        )}
      </div>

      {/* Drag ghost follows pointer */}
      {dragState && (
        <DragGhost item={dragState.item} x={dragState.x} y={dragState.y} />
      )}
    </div>
  );
});
