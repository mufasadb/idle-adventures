import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';
import type { ItemStack } from '../../stores/playerStore';
import type { ItemCategory } from '../../data/items';

interface DragState {
  item: ItemStack | null;
  source: { type: 'bank' | 'loadout'; slotType?: string; slotIndex?: number } | null;
}

interface DragDropContextType {
  dragState: DragState;
  startDrag: (item: ItemStack, source: DragState['source']) => void;
  endDrag: () => void;
  isDragging: boolean;
}

const DragDropContext = createContext<DragDropContextType | null>(null);

export function DragDropProvider({ children }: { children: ReactNode }) {
  const [dragState, setDragState] = useState<DragState>({ item: null, source: null });

  const startDrag = useCallback((item: ItemStack, source: DragState['source']) => {
    setDragState({ item, source });
  }, []);

  const endDrag = useCallback(() => {
    setDragState({ item: null, source: null });
  }, []);

  const isDragging = dragState.item !== null;

  return (
    <DragDropContext.Provider value={{ dragState, startDrag, endDrag, isDragging }}>
      {children}
    </DragDropContext.Provider>
  );
}

export function useDragDrop() {
  const context = useContext(DragDropContext);
  if (!context) {
    throw new Error('useDragDrop must be used within DragDropProvider');
  }
  return context;
}

/**
 * Check if a category can go in a slot type
 */
export function canCategoryGoInSlot(
  category: ItemCategory,
  slotType: 'vehicle' | 'food' | 'misc'
): boolean {
  switch (slotType) {
    case 'vehicle':
      return category === 'vehicle';
    case 'food':
      return category === 'food';
    case 'misc':
      return category === 'tool' || category === 'potion';
    default:
      return false;
  }
}
