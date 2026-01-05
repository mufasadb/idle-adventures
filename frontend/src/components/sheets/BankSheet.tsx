import { observer } from 'mobx-react-lite';
import { BottomSheet } from '../layout';
import { playerStore } from '../../stores/playerStore';
import { ITEMS } from '../../data/items';

export const BankSheet = observer(() => {
  // Group items by category
  const itemsByCategory = playerStore.bank.reduce(
    (acc, stack) => {
      const item = ITEMS[stack.itemId];
      if (!item) return acc;

      const category = item.category;
      if (!acc[category]) acc[category] = [];
      acc[category].push({ ...stack, item });
      return acc;
    },
    {} as Record<string, Array<{ itemId: string; count: number; item: typeof ITEMS[string] }>>
  );

  const categoryLabels: Record<string, string> = {
    currency: 'Currency',
    food: 'Food',
    ingredient: 'Ingredients',
    tool: 'Tools',
    potion: 'Potions',
    vehicle: 'Vehicles',
    material: 'Materials',
    gem: 'Gems',
    water: 'Water',
  };

  const categoryOrder = ['currency', 'food', 'tool', 'potion', 'vehicle', 'material', 'gem', 'ingredient', 'water'];

  return (
    <BottomSheet
      id="bank"
      title="Bank"
      subtitle={`${playerStore.bank.length} item types stored`}
    >
      <div className="space-y-4">
        {categoryOrder.map(category => {
          const items = itemsByCategory[category];
          if (!items || items.length === 0) return null;

          return (
            <div key={category}>
              <h3 className="text-accent text-sm font-medium mb-2">
                {categoryLabels[category] || category}
              </h3>
              <div className="grid grid-cols-2 gap-2">
                {items.map(({ itemId, count, item }) => (
                  <div
                    key={itemId}
                    className="bg-app-tertiary rounded-lg p-3 flex items-center gap-2"
                  >
                    <span className="text-xl">{item.icon}</span>
                    <div className="flex-1 min-w-0">
                      <div className="text-app-primary text-sm truncate">{item.name}</div>
                      <div className="text-app-muted text-xs">x{count.toLocaleString()}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </BottomSheet>
  );
});
