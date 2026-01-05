/**
 * ExpeditionResultsModal
 *
 * Modal shown at the end of an expedition displaying earned resources.
 */

import { observer } from 'mobx-react-lite';
import { Home } from 'lucide-react';
import { ITEMS } from '../data/items';
import { expeditionExecutionStore } from '../engine/expeditionExecutionStore';

export const ExpeditionResultsModal = observer(() => {
  const { groupedResources, state } = expeditionExecutionStore;

  if (state !== 'completed') return null;

  const handleReturnHome = () => {
    expeditionExecutionStore.completeExpedition();
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div className="bg-app-secondary border border-app rounded-xl p-6 max-w-sm w-full mx-4 shadow-2xl">
        {/* Header */}
        <h2 className="text-xl font-bold text-accent text-center mb-4">
          Expedition Complete!
        </h2>

        {/* Resources earned */}
        <div className="bg-app-primary rounded-lg p-4 mb-6">
          <h3 className="text-sm text-app-muted mb-3 uppercase tracking-wide">
            Resources Earned
          </h3>

          {groupedResources.length === 0 ? (
            <p className="text-app-muted text-center py-4">No resources collected</p>
          ) : (
            <div className="space-y-2">
              {groupedResources.map(({ itemId, count }) => {
                const item = ITEMS[itemId];
                return (
                  <div
                    key={itemId}
                    className="flex items-center justify-between bg-app-tertiary rounded-lg px-3 py-2"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-xl">{item?.icon ?? '?'}</span>
                      <span className="text-app-primary">{item?.name ?? itemId}</span>
                    </div>
                    <span className="text-accent font-bold">+{count}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Return home button */}
        <button
          onClick={handleReturnHome}
          className="w-full bg-accent hover:bg-accent/90 text-white font-bold py-3 px-4 rounded-lg flex items-center justify-center gap-2 transition-colors"
        >
          <Home size={20} />
          Return Home
        </button>
      </div>
    </div>
  );
});
