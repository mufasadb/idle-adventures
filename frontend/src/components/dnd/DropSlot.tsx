import { useState } from 'react';
import { observer } from 'mobx-react-lite';
import type { ItemStack } from '../../stores/playerStore';
import { ITEMS } from '../../data/items';
import { useDragDrop, canCategoryGoInSlot } from './DragDropContext';
import { DraggableItem } from './DraggableItem';

interface DropSlotProps {
  slotType: 'vehicle' | 'food' | 'misc';
  slotIndex?: number;
  item: ItemStack | null;
  onDrop: (item: ItemStack) => void;
  onRemove: () => void;
  label?: string;
  emptyIcon?: string;
}

export const DropSlot = observer(({
  slotType,
  slotIndex = 0,
  item,
  onDrop,
  onRemove,
  label,
  emptyIcon = '➕',
}: DropSlotProps) => {
  const { dragState, endDrag } = useDragDrop();
  const [isOver, setIsOver] = useState(false);

  // Check if current dragged item can go in this slot
  const canAccept = (() => {
    if (!dragState.item) return false;
    const itemDef = ITEMS[dragState.item.itemId];
    if (!itemDef) return false;
    return canCategoryGoInSlot(itemDef.category, slotType);
  })();

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    if (canAccept) {
      e.dataTransfer.dropEffect = 'move';
      setIsOver(true);
    }
  };

  const handleDragLeave = () => {
    setIsOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsOver(false);

    if (dragState.item && canAccept) {
      onDrop(dragState.item);
      endDrag();
    }
  };

  const isEmpty = item === null;

  // Visual states
  const isValidTarget = dragState.item && canAccept;
  const isInvalidTarget = dragState.item && !canAccept;

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={`
        relative aspect-square rounded-lg border-2 border-dashed
        flex items-center justify-center transition-all
        ${isEmpty ? 'bg-app-tertiary' : 'bg-app-secondary border-solid'}
        ${isOver && canAccept ? 'border-accent bg-accent/20 scale-105' : ''}
        ${isValidTarget && !isOver ? 'border-accent/50' : ''}
        ${isInvalidTarget ? 'border-red-500/30 bg-red-500/5' : ''}
        ${!dragState.item && isEmpty ? 'border-app' : ''}
        ${!dragState.item && !isEmpty ? 'border-accent' : ''}
      `}
    >
      {isEmpty ? (
        <div className="text-center">
          <span className="text-xl text-app-muted">{emptyIcon}</span>
          {label && (
            <div className="text-[10px] text-app-muted mt-1">{label}</div>
          )}
        </div>
      ) : (
        <DraggableItem
          item={item}
          source={{ type: 'loadout', slotType, slotIndex }}
          onRemove={onRemove}
          compact
        />
      )}

      {/* Item count badge */}
      {item && item.count > 1 && (
        <div className="absolute -bottom-1 -right-1 bg-accent text-white text-[10px] font-bold rounded-full w-5 h-5 flex items-center justify-center">
          {item.count}
        </div>
      )}
    </div>
  );
});
