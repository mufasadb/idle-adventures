/**
 * @deprecated This component uses the legacy gameStore.
 * Use BankSheet with playerStore.bank instead.
 */
import { observer } from 'mobx-react-lite';
import { useState } from 'react';
import { BottomSheet } from '../layout';
import { gameStore, type InventoryItem } from '../../stores/gameStore';

export const InventorySheet = observer(() => {
  const [selectedItem, setSelectedItem] = useState<InventoryItem | null>(null);

  return (
    <BottomSheet
      id="inventory"
      title="Inventory"
      subtitle={`${gameStore.usedSlots}/${gameStore.maxCarrySlots} slots used`}
    >
      {/* Grid */}
      <div className="grid grid-cols-5 gap-1 mb-4">
        {gameStore.inventory.map((item, index) => (
          <div
            key={index}
            onClick={() => item && setSelectedItem(item)}
            className={`inventory-slot ${item ? 'filled cursor-pointer' : ''}`}
          >
            {item && (
              <>
                <span>{item.icon}</span>
                <span className="count">{item.count}</span>
              </>
            )}
          </div>
        ))}
      </div>

      {/* Selected Item Details */}
      {selectedItem && (
        <div className="bg-app-tertiary rounded-lg p-3">
          <div className="flex items-center gap-3">
            <span className="text-2xl">{selectedItem.icon}</span>
            <div>
              <div className="text-app-primary font-bold">
                {selectedItem.name} x{selectedItem.count}
              </div>
              <div className="text-app-muted text-sm">
                {selectedItem.description || 'No description'}
              </div>
              <div className="text-app-muted text-xs mt-1">
                Weight: {selectedItem.weight} each
              </div>
            </div>
          </div>
        </div>
      )}
    </BottomSheet>
  );
});
