import { observer } from 'mobx-react-lite';
import { Truck, Utensils, Backpack } from 'lucide-react';
import { ITEMS } from '../data/items';
import { sessionStore, type LoadoutItem } from '../stores/sessionStore';
import type { ItemStack } from '../stores/playerStore';

type SlotType = 'vehicle' | 'food' | 'misc';

interface LoadoutSlotProps {
  slotType: SlotType;
  slotIndex?: number;
  item: LoadoutItem | ItemStack | null;
  compact?: boolean;  // Smaller size for food slots
}

// Icons for empty slot states
const SLOT_ICONS: Record<SlotType, typeof Truck> = {
  vehicle: Truck,
  food: Utensils,
  misc: Backpack,
};

export const LoadoutSlot = observer(({
  slotType,
  slotIndex = 0,
  item,
  compact = false,
}: LoadoutSlotProps) => {
  const handleTap = () => {
    sessionStore.openSheet(`item-picker-${slotType}-${slotIndex}`);
  };

  const itemDef = item ? ITEMS[item.itemId] : null;
  const isEmpty = item === null;
  const Icon = SLOT_ICONS[slotType];

  return (
    <button
      onClick={handleTap}
      className={`
        relative rounded-lg border-2
        flex items-center justify-center transition-all
        active:scale-95
        ${compact ? 'aspect-square' : 'aspect-square'}
        ${isEmpty
          ? 'bg-app-tertiary border-dashed border-app/50 hover:border-accent/50'
          : 'bg-app-secondary border-solid border-accent'
        }
      `}
    >
      {isEmpty ? (
        <Icon
          className="text-app-muted/40"
          size={compact ? 18 : 24}
          strokeWidth={1.5}
        />
      ) : (
        <span className={compact ? 'text-lg' : 'text-2xl'}>
          {itemDef?.icon}
        </span>
      )}
    </button>
  );
});
