import { useEffect, useRef, useState, useCallback } from 'react';
import { observer } from 'mobx-react-lite';
import { stashStore, type StashItem } from '../stores/stashStore';
import { Header } from '../components/layout';
import { sessionStore } from '../stores/sessionStore';

const STASH_SIZE = 20;
const COLS = 4;

// ── Slot component ─────────────────────────────────────────────────────────

interface SlotProps {
  index: number;
  item: StashItem | null;
  isDragOver: boolean;
  isDragging: boolean;
  onPointerDown: (e: React.PointerEvent, index: number) => void;
}

const StashSlot = observer(({
  index,
  item,
  isDragOver,
  isDragging,
  onPointerDown,
}: SlotProps) => {
  return (
    <div
      data-slot-index={index}
      onPointerDown={item ? (e) => onPointerDown(e, index) : undefined}
      className={`
        relative aspect-square rounded-lg border-2
        flex items-center justify-center select-none
        transition-all duration-100
        ${item
          ? 'bg-app-secondary border-accent cursor-grab active:cursor-grabbing'
          : 'bg-app-tertiary border-dashed border-app'}
        ${isDragOver && !isDragging ? 'border-accent bg-accent/20 scale-105' : ''}
        ${isDragging ? 'opacity-30' : ''}
      `}
    >
      {item ? (
        <>
          <span className="text-2xl leading-none">{item.definition.icon}</span>
          {item.quantity > 1 && (
            <span className="absolute bottom-0.5 right-1 text-[10px] font-bold text-accent leading-none">
              {item.quantity}
            </span>
          )}
        </>
      ) : (
        <span className="text-app-muted text-xs opacity-40">{index + 1}</span>
      )}
    </div>
  );
});

// ── Furnace component ───────────────────────────────────────────────────────

interface FurnaceProps {
  isDragOver: boolean;
}

const Furnace = observer(({ isDragOver }: FurnaceProps) => (
  <div
    data-furnace="true"
    className={`
      relative rounded-xl border-2 p-3 flex flex-col items-center justify-center
      transition-all duration-100 select-none
      ${isDragOver
        ? 'border-red-500 bg-red-500/20 scale-105'
        : 'border-dashed border-red-500/40 bg-red-500/5'}
    `}
    style={{ minHeight: 72 }}
  >
    <span className="text-3xl">🔥</span>
    <span className="text-[10px] text-red-400 mt-1 font-medium">Furnace</span>
    {isDragOver && (
      <span className="text-[9px] text-red-300 mt-0.5">Drop to destroy</span>
    )}
  </div>
));

// ── Drag ghost ──────────────────────────────────────────────────────────────

interface DragGhostProps {
  item: StashItem;
  x: number;
  y: number;
}

const DragGhost = ({ item, x, y }: DragGhostProps) => (
  <div
    className="fixed z-50 pointer-events-none"
    style={{ left: x - 28, top: y - 28, width: 56, height: 56 }}
  >
    <div className="w-full h-full rounded-lg bg-app-secondary border-2 border-accent shadow-lg opacity-90 flex items-center justify-center">
      <span className="text-2xl">{item.definition.icon}</span>
      {item.quantity > 1 && (
        <span className="absolute bottom-0.5 right-1 text-[10px] font-bold text-accent">
          {item.quantity}
        </span>
      )}
    </div>
  </div>
);

// ── Confirmation modal ──────────────────────────────────────────────────────

interface ConfirmDestroyProps {
  item: StashItem;
  onConfirm: () => void;
  onCancel: () => void;
}

const ConfirmDestroy = ({ item, onConfirm, onCancel }: ConfirmDestroyProps) => (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
    <div className="bg-app-secondary rounded-2xl p-6 mx-4 max-w-xs w-full shadow-2xl">
      <div className="text-center mb-4">
        <span className="text-4xl">{item.definition.icon}</span>
      </div>
      <div className="text-app-primary font-bold text-center mb-1">Destroy item?</div>
      <div className="text-app-muted text-sm text-center mb-5">
        {item.definition.name} will be permanently destroyed.
      </div>
      <div className="flex gap-3">
        <button
          onClick={onCancel}
          className="flex-1 py-2.5 rounded-xl bg-app-tertiary text-app-primary text-sm font-medium"
        >
          Cancel
        </button>
        <button
          onClick={onConfirm}
          className="flex-1 py-2.5 rounded-xl bg-red-500 text-white text-sm font-bold"
        >
          Destroy
        </button>
      </div>
    </div>
  </div>
);

// ── Main screen ─────────────────────────────────────────────────────────────

export const StashScreen = observer(() => {
  const [dragState, setDragState] = useState<{
    fromIndex: number;
    item: StashItem;
    x: number;
    y: number;
  } | null>(null);

  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [dragOverFurnace, setDragOverFurnace] = useState(false);

  const [confirmDestroy, setConfirmDestroy] = useState<{
    item: StashItem;
    fromIndex: number;
  } | null>(null);

  const [isAddingItem, setIsAddingItem] = useState(false);

  const dragStateRef = useRef(dragState);
  dragStateRef.current = dragState;

  useEffect(() => {
    stashStore.loadFromServer();
  }, []);

  // ── Pointer move / up handlers (attached globally during drag) ──────────

  const handlePointerMove = useCallback((e: PointerEvent) => {
    const ds = dragStateRef.current;
    if (!ds) return;

    setDragState(prev => prev ? { ...prev, x: e.clientX, y: e.clientY } : null);

    // Find element under pointer (ghost has pointer-events:none)
    const el = document.elementFromPoint(e.clientX, e.clientY);
    if (!el) {
      setDragOverIndex(null);
      setDragOverFurnace(false);
      return;
    }

    const slotEl = el.closest('[data-slot-index]');
    const furnaceEl = el.closest('[data-furnace]');

    if (slotEl) {
      const idx = parseInt((slotEl as HTMLElement).dataset.slotIndex ?? '-1', 10);
      setDragOverIndex(idx >= 0 ? idx : null);
      setDragOverFurnace(false);
    } else if (furnaceEl) {
      setDragOverIndex(null);
      setDragOverFurnace(true);
    } else {
      setDragOverIndex(null);
      setDragOverFurnace(false);
    }
  }, []);

  const handlePointerUp = useCallback((e: PointerEvent) => {
    const ds = dragStateRef.current;
    if (!ds) return;

    document.removeEventListener('pointermove', handlePointerMove);
    document.removeEventListener('pointerup', handlePointerUp);

    const el = document.elementFromPoint(e.clientX, e.clientY);
    const slotEl = el?.closest('[data-slot-index]');
    const furnaceEl = el?.closest('[data-furnace]');

    setDragState(null);
    setDragOverIndex(null);
    setDragOverFurnace(false);

    if (furnaceEl) {
      // Drop on furnace → confirm destroy
      setConfirmDestroy({ item: ds.item, fromIndex: ds.fromIndex });
      return;
    }

    if (slotEl) {
      const toIndex = parseInt((slotEl as HTMLElement).dataset.slotIndex ?? '-1', 10);
      if (toIndex < 0 || toIndex === ds.fromIndex) return;

      const targetItem = stashStore.slots[toIndex];
      if (targetItem) {
        // Swap
        stashStore.swapItems(ds.item.id, ds.fromIndex, targetItem.id, toIndex);
      } else {
        // Move to empty
        stashStore.moveItem(ds.item.id, ds.fromIndex, toIndex);
      }
    }
  }, [handlePointerMove]);

  const handlePointerDown = useCallback((e: React.PointerEvent, index: number) => {
    e.preventDefault();
    const item = stashStore.slots[index];
    if (!item) return;

    setDragState({ fromIndex: index, item, x: e.clientX, y: e.clientY });

    document.addEventListener('pointermove', handlePointerMove);
    document.addEventListener('pointerup', handlePointerUp);
  }, [handlePointerMove, handlePointerUp]);

  // ── Dev: add random item ────────────────────────────────────────────────

  const handleAddRandom = async () => {
    setIsAddingItem(true);
    await stashStore.addRandomItem();
    setIsAddingItem(false);
  };

  // ── Destroy confirm ─────────────────────────────────────────────────────

  const handleConfirmDestroy = async () => {
    if (!confirmDestroy) return;
    await stashStore.destroyItem(confirmDestroy.item.id, confirmDestroy.fromIndex);
    setConfirmDestroy(null);
  };

  // ── Render ──────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full bg-app-primary">
      <Header
        title="Stash"
        showBack
        onBack={() => sessionStore.navigateTo('town')}
      />

      {stashStore.isLoading ? (
        <div className="flex-1 flex items-center justify-center">
          <span className="text-app-muted text-sm">Loading stash…</span>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Slot count */}
          <div className="text-app-muted text-xs text-right">
            {stashStore.itemCount} / {STASH_SIZE} slots used
          </div>

          {/* Stash grid */}
          <div
            className="grid gap-2"
            style={{ gridTemplateColumns: `repeat(${COLS}, 1fr)` }}
          >
            {Array.from({ length: STASH_SIZE }, (_, i) => (
              <StashSlot
                key={i}
                index={i}
                item={stashStore.slots[i]}
                isDragOver={dragOverIndex === i}
                isDragging={dragState?.fromIndex === i}
                onPointerDown={handlePointerDown}
              />
            ))}
          </div>

          {/* Furnace + dev button row */}
          <div className="grid grid-cols-2 gap-3 pt-1">
            <Furnace isDragOver={dragOverFurnace} />

            {/* Dev: add random item */}
            <button
              onClick={handleAddRandom}
              disabled={isAddingItem || stashStore.itemCount >= STASH_SIZE}
              className="rounded-xl border-2 border-dashed border-accent/40 bg-accent/5
                flex flex-col items-center justify-center p-3 gap-1
                disabled:opacity-40 active:bg-accent/10 transition-colors"
            >
              <span className="text-2xl">🎲</span>
              <span className="text-[10px] text-accent font-medium">
                {isAddingItem ? 'Adding…' : 'Add Item'}
              </span>
            </button>
          </div>

          {stashStore.error && (
            <div className="text-red-400 text-xs text-center py-2">
              {stashStore.error}
            </div>
          )}
        </div>
      )}

      {/* Drag ghost */}
      {dragState && (
        <DragGhost item={dragState.item} x={dragState.x} y={dragState.y} />
      )}

      {/* Destroy confirmation */}
      {confirmDestroy && (
        <ConfirmDestroy
          item={confirmDestroy.item}
          onConfirm={handleConfirmDestroy}
          onCancel={() => setConfirmDestroy(null)}
        />
      )}
    </div>
  );
});
