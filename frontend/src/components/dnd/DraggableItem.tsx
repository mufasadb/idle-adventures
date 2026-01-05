import { observer } from 'mobx-react-lite';
import type { ItemStack } from '../../stores/playerStore';
import { ITEMS } from '../../data/items';
import { useDragDrop } from './DragDropContext';

interface DraggableItemProps {
  item: ItemStack;
  source: { type: 'bank' | 'loadout'; slotType?: string; slotIndex?: number };
  onRemove?: () => void;
  compact?: boolean;
}

export const DraggableItem = observer(({ item, source, onRemove, compact }: DraggableItemProps) => {
  const { startDrag, endDrag, dragState } = useDragDrop();
  const itemDef = ITEMS[item.itemId];

  if (!itemDef) return null;

  const isBeingDragged = dragState.item?.itemId === item.itemId &&
    dragState.source?.type === source.type &&
    dragState.source?.slotIndex === source.slotIndex;

  const handleDragStart = (e: React.DragEvent) => {
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', item.itemId);
    startDrag(item, source);
  };

  const handleDragEnd = () => {
    endDrag();
  };

  const handleClick = () => {
    if (onRemove) {
      onRemove();
    }
  };

  if (compact) {
    return (
      <div
        draggable
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onClick={handleClick}
        className={`
          flex items-center justify-center w-full h-full cursor-grab active:cursor-grabbing
          ${isBeingDragged ? 'opacity-50' : ''}
        `}
      >
        <span className="text-lg">{itemDef.icon}</span>
        {item.count > 1 && (
          <span className="absolute bottom-0.5 right-1 text-[10px] font-bold text-app-primary">
            {item.count}
          </span>
        )}
      </div>
    );
  }

  return (
    <div
      draggable
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onClick={handleClick}
      className={`
        bg-app-tertiary rounded-lg p-2 cursor-grab active:cursor-grabbing
        flex items-center gap-2 hover:bg-app-hover transition-colors
        ${isBeingDragged ? 'opacity-50' : ''}
      `}
    >
      <span className="text-xl">{itemDef.icon}</span>
      <div className="flex-1 min-w-0">
        <div className="text-app-primary text-sm truncate">{itemDef.name}</div>
        <div className="text-app-muted text-xs">x{item.count}</div>
      </div>
    </div>
  );
});
