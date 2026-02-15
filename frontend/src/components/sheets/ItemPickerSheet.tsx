import { observer } from 'mobx-react-lite';
import { BottomSheet } from '../layout';
import { sessionStore } from '../../stores/sessionStore';
import { playerStore, type ItemStack } from '../../stores/playerStore';
import { ITEMS, type ItemCategory } from '../../data/items';

type SlotType = 'vehicle' | 'food' | 'misc';

// Helper to get which categories can go in which slot
const SLOT_CATEGORIES: Record<SlotType, ItemCategory[]> = {
  vehicle: ['vehicle'],
  food: ['food'],
  misc: ['tool', 'potion'],
};

export const ItemPickerSheet = observer(() => {
  // Parse the sheet ID to get slot info: "item-picker-food-0" -> { slotType: 'food', slotIndex: 0 }
  const activeSheet = sessionStore.activeSheet;

  if (!activeSheet?.startsWith('item-picker-')) return null;

  const parts = activeSheet.replace('item-picker-', '').split('-');
  const slotType = parts[0] as SlotType;
  const slotIndex = parseInt(parts[1] || '0', 10);

  const allowedCategories = SLOT_CATEGORIES[slotType] || [];

  // Get available items from bank that match this slot type
  const availableItems = playerStore.bank.filter(stack => {
    const item = ITEMS[stack.itemId];
    return item && allowedCategories.includes(item.category);
  });

  // For food items, the bank count already reflects what's available
  // (items are removed from bank when placed in loadout)
  const getAvailableCount = (_itemId: string, bankCount: number): number => {
    return bankCount;
  };

  // Get empty food slot indices
  const getEmptyFoodSlots = (): number[] => {
    return sessionStore.loadout.food
      .map((slot, idx) => slot === null ? idx : -1)
      .filter(idx => idx !== -1);
  };

  // Handle selecting a single food item
  const handleSelectFoodItem = (itemId: string) => {
    // Get current item in this slot
    const current = sessionStore.loadout.food[slotIndex];

    // If clicking on currently equipped item, do nothing (use remove button instead)
    if (current?.itemId === itemId) {
      sessionStore.closeSheet();
      return;
    }

    // Return current item to bank (add 1 back)
    if (current) {
      playerStore.addToBank(current.itemId, 1);
    }

    // Remove 1 from bank and add to loadout
    playerStore.removeFromBank(itemId, 1);
    sessionStore.setFood(slotIndex, { itemId });

    sessionStore.closeSheet();
  };

  // Fill one empty slot with food item
  const handleFillOne = (itemId: string) => {
    const emptySlots = getEmptyFoodSlots();
    if (emptySlots.length === 0) return;

    const bankStack = playerStore.bank.find(s => s.itemId === itemId);
    if (!bankStack || bankStack.count <= 0) return;

    playerStore.removeFromBank(itemId, 1);
    sessionStore.setFood(emptySlots[0], { itemId });
  };

  // Fill all remaining empty slots with food item
  const handleFillAll = (itemId: string) => {
    const emptySlots = getEmptyFoodSlots();
    if (emptySlots.length === 0) return;

    const bankStack = playerStore.bank.find(s => s.itemId === itemId);
    if (!bankStack || bankStack.count <= 0) return;

    const toFill = Math.min(emptySlots.length, bankStack.count);
    for (let i = 0; i < toFill; i++) {
      playerStore.removeFromBank(itemId, 1);
      sessionStore.setFood(emptySlots[i], { itemId });
    }

    sessionStore.closeSheet();
  };

  // Handle selecting vehicle or misc item (full stack)
  const handleSelectStackItem = (stack: ItemStack) => {
    const { loadout } = sessionStore;

    // Capture count before removing (MobX observes the original)
    const itemToEquip = { itemId: stack.itemId, count: stack.count };

    if (slotType === 'vehicle') {
      if (loadout.vehicle) {
        playerStore.addToBank(loadout.vehicle.itemId, loadout.vehicle.count);
      }
      playerStore.removeFromBank(itemToEquip.itemId, itemToEquip.count);
      sessionStore.setVehicle(itemToEquip);
    } else if (slotType === 'misc') {
      const current = loadout.misc[slotIndex];
      if (current) {
        playerStore.addToBank(current.itemId, current.count);
      }
      playerStore.removeFromBank(itemToEquip.itemId, itemToEquip.count);
      sessionStore.setMisc(slotIndex, itemToEquip);
    }

    sessionStore.closeSheet();
  };

  const handleClear = () => {
    const { loadout } = sessionStore;

    if (slotType === 'vehicle' && loadout.vehicle) {
      playerStore.addToBank(loadout.vehicle.itemId, loadout.vehicle.count);
      sessionStore.setVehicle(null);
    } else if (slotType === 'food') {
      const current = loadout.food[slotIndex];
      if (current) {
        playerStore.addToBank(current.itemId, 1);  // Return 1 item
        sessionStore.setFood(slotIndex, null);
      }
    } else if (slotType === 'misc') {
      const current = loadout.misc[slotIndex];
      if (current) {
        playerStore.addToBank(current.itemId, current.count);
        sessionStore.setMisc(slotIndex, null);
      }
    }

    sessionStore.closeSheet();
  };

  // Get current item in slot
  const getCurrentItemId = (): string | null => {
    const { loadout } = sessionStore;
    if (slotType === 'vehicle') return loadout.vehicle?.itemId ?? null;
    if (slotType === 'food') return loadout.food[slotIndex]?.itemId ?? null;
    if (slotType === 'misc') return loadout.misc[slotIndex]?.itemId ?? null;
    return null;
  };

  const currentItemId = getCurrentItemId();
  const currentItemDef = currentItemId ? ITEMS[currentItemId] : null;

  const slotLabels: Record<SlotType, string> = {
    vehicle: 'Vehicle',
    food: 'Food',
    misc: 'Tool / Potion',
  };

  // Filter items that have remaining available count
  const itemsToShow = availableItems.filter(stack => {
    const available = getAvailableCount(stack.itemId, stack.count);
    // Show item if it has remaining count OR if it's the currently equipped item
    return available > 0 || stack.itemId === currentItemId;
  });

  return (
    <BottomSheet
      id={activeSheet}
      title={`Select ${slotLabels[slotType]}`}
      subtitle={itemsToShow.length === 0 ? 'No items available' : undefined}
    >
      {/* Current selection */}
      {currentItemId && currentItemDef && (
        <div className="mb-4">
          <div className="text-app-muted text-xs mb-2 uppercase tracking-wide">Currently Equipped</div>
          <div className="flex items-center justify-between bg-accent/20 border border-accent rounded-lg p-3">
            <div className="flex items-center gap-3">
              <span className="text-2xl">{currentItemDef.icon}</span>
              <div>
                <div className="text-app-primary font-medium">{currentItemDef.name}</div>
                <div className="text-app-muted text-xs">
                  {currentItemDef.actions && `${currentItemDef.actions} actions`}
                  {currentItemDef.bagSlots && `+${currentItemDef.bagSlots} bag slots`}
                </div>
              </div>
            </div>
            <button
              onClick={handleClear}
              className="text-red-400 text-sm font-medium px-3 py-1 bg-red-400/10 rounded-lg"
            >
              Remove
            </button>
          </div>
        </div>
      )}

      {/* Available items */}
      {itemsToShow.length > 0 ? (
        <div className="space-y-2">
          <div className="text-app-muted text-xs mb-2 uppercase tracking-wide">Available Items</div>
          {itemsToShow.map(stack => {
            const itemDef = ITEMS[stack.itemId];
            if (!itemDef) return null;

            const availableCount = getAvailableCount(stack.itemId, stack.count);
            const isCurrentItem = stack.itemId === currentItemId;

            // Don't show item if no remaining count (unless it's current)
            if (availableCount <= 0 && !isCurrentItem) return null;

            const emptySlots = slotType === 'food' ? getEmptyFoodSlots().length : 0;

            return (
              <div
                key={stack.itemId}
                className={`
                  rounded-lg p-3 transition-colors
                  ${availableCount <= 0
                    ? 'bg-app-tertiary/50 opacity-50'
                    : 'bg-app-tertiary'
                  }
                `}
              >
                <button
                  onClick={() => {
                    if (slotType === 'food') {
                      handleSelectFoodItem(stack.itemId);
                    } else {
                      handleSelectStackItem(stack);
                    }
                  }}
                  disabled={availableCount <= 0}
                  className="w-full flex items-center gap-3 text-left"
                >
                  <span className="text-2xl">{itemDef.icon}</span>
                  <div className="flex-1">
                    <div className="text-app-primary font-medium">{itemDef.name}</div>
                    <div className="text-app-muted text-xs">
                      {slotType === 'food' ? (
                        <>
                          {availableCount} available
                          {itemDef.actions && ` • ${itemDef.actions} actions each`}
                        </>
                      ) : (
                        <>
                          x{stack.count}
                          {itemDef.bagSlots && ` • +${itemDef.bagSlots} bag slots`}
                          {itemDef.speedBonus && ` • ${itemDef.speedBonus > 0 ? '+' : ''}${itemDef.speedBonus}% speed`}
                        </>
                      )}
                    </div>
                  </div>
                  {availableCount > 0 && <span className="text-accent">❯</span>}
                </button>

                {/* Fill buttons for food items */}
                {slotType === 'food' && availableCount > 0 && emptySlots > 0 && (
                  <div className="flex gap-2 mt-2 pt-2 border-t border-app/30">
                    <button
                      onClick={() => handleFillOne(stack.itemId)}
                      className="flex-1 py-1.5 px-3 text-xs font-medium bg-accent/20 hover:bg-accent/30 text-accent rounded-md transition-colors"
                    >
                      Fill +1
                    </button>
                    <button
                      onClick={() => handleFillAll(stack.itemId)}
                      className="flex-1 py-1.5 px-3 text-xs font-medium bg-accent/20 hover:bg-accent/30 text-accent rounded-md transition-colors"
                    >
                      Fill All ({Math.min(emptySlots, availableCount)})
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="text-center py-8">
          <div className="text-4xl mb-2">📦</div>
          <div className="text-app-muted">
            No {slotLabels[slotType].toLowerCase()} items in your bank
          </div>
        </div>
      )}

      {/* Go on foot option for vehicle slot */}
      {slotType === 'vehicle' && currentItemId && (
        <div className="mt-4 pt-4 border-t border-app">
          <button
            onClick={handleClear}
            className="w-full flex items-center gap-3 bg-app-tertiary hover:bg-app-hover rounded-lg p-3 text-left transition-colors"
          >
            <span className="text-2xl">🚶</span>
            <div className="flex-1">
              <div className="text-app-primary font-medium">Go on Foot</div>
              <div className="text-app-muted text-xs">No vehicle bonus, 2 misc slots</div>
            </div>
          </button>
        </div>
      )}
    </BottomSheet>
  );
});
