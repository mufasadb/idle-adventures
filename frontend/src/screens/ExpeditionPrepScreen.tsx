import { observer } from 'mobx-react-lite';
import { Header } from '../layout';
import { sessionStore } from '../../stores/sessionStore';
import { ITEMS } from '../../data/items';
import { LoadoutSlot } from '../LoadoutSlot';
import { ItemPickerSheet } from '../sheets/ItemPickerSheet';

export const ExpeditionPrepScreen = observer(() => {
  const { loadout, selectedMap, totalActions, miscSlotCount, canStartExpedition } = sessionStore;

  const handleStartExpedition = () => {
    sessionStore.startExpedition();
  };

  return (
    <div className="flex flex-col h-full bg-app-primary">
      <Header
        title="Prepare Expedition"
        showBack
        onBack={() => sessionStore.navigateTo('town')}
      />

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Map Selection */}
        <div className="bg-app-secondary rounded-lg p-4">
          <h3 className="text-accent font-bold mb-3">Destination</h3>
          <button
            onClick={() => sessionStore.openSheet('map-details')}
            className="w-full bg-app-tertiary hover:bg-app-hover rounded-lg p-3 text-left flex items-center justify-between"
          >
            <div className="flex items-center gap-3">
              <span className="text-xl">📜</span>
              <div>
                <div className="text-app-primary font-medium">{selectedMap?.name || 'No map selected'}</div>
                <div className="text-app-muted text-xs">
                  {selectedMap ? `${selectedMap.travelDays} days travel | Tier ${selectedMap.tier}` : 'Tap to select'}
                </div>
              </div>
            </div>
            <span className="text-app-muted">❯</span>
          </button>
        </div>

        {/* Loadout Section */}
        <div className="bg-app-secondary rounded-lg p-4">
          <h3 className="text-accent font-bold mb-3">Loadout</h3>
          <p className="text-app-muted text-xs mb-4">Tap a slot to equip items from your bank</p>

          {/* Vehicle Slot */}
          <div className="mb-4">
            <div className="text-app-muted text-xs mb-2 uppercase tracking-wide">Vehicle</div>
            <div className="w-14 h-14">
              <LoadoutSlot
                slotType="vehicle"
                item={loadout.vehicle}
              />
            </div>
          </div>

          {/* Food Slots */}
          <div className="mb-4">
            <div className="flex justify-between items-center mb-2">
              <span className="text-app-muted text-xs uppercase tracking-wide">Food (6 slots)</span>
              <span className="text-accent text-xs font-bold">{totalActions} actions</span>
            </div>
            <div className="grid grid-cols-6 gap-1.5">
              {loadout.food.map((item, index) => (
                <LoadoutSlot
                  key={`food-${index}`}
                  slotType="food"
                  slotIndex={index}
                  item={item}
                  compact
                />
              ))}
            </div>
          </div>

          {/* Misc Slots */}
          <div>
            <div className="text-app-muted text-xs mb-2 uppercase tracking-wide">
              Misc ({miscSlotCount} slots)
            </div>
            <div className="grid grid-cols-4 gap-2">
              {loadout.misc.map((item, index) => (
                <LoadoutSlot
                  key={`misc-${index}`}
                  slotType="misc"
                  slotIndex={index}
                  item={item}
                />
              ))}
            </div>
          </div>
        </div>

        {/* Mode Toggle */}
        <div className="bg-app-secondary rounded-lg p-4">
          <div className="flex justify-between items-center mb-2">
            <h3 className="text-accent font-bold">Gathering Mode</h3>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => sessionStore.setMode('active')}
              className={`p-3 rounded-lg border-2 transition-all ${
                loadout.mode === 'active'
                  ? 'border-accent bg-accent/20 text-app-primary'
                  : 'border-app bg-app-tertiary text-app-muted'
              }`}
            >
              <div className="text-lg mb-1">🎮</div>
              <div className="font-medium text-sm">Active</div>
              <div className="text-xs text-app-muted">Play minigames</div>
              <div className="text-xs text-accent">85-100% yield</div>
            </button>
            <button
              onClick={() => sessionStore.setMode('passive')}
              className={`p-3 rounded-lg border-2 transition-all ${
                loadout.mode === 'passive'
                  ? 'border-accent bg-accent/20 text-app-primary'
                  : 'border-app bg-app-tertiary text-app-muted'
              }`}
            >
              <div className="text-lg mb-1">🔄</div>
              <div className="font-medium text-sm">Passive</div>
              <div className="text-xs text-app-muted">Auto-complete</div>
              <div className="text-xs text-accent">75% yield</div>
            </button>
          </div>
        </div>

        {/* Trip Summary */}
        <div className="bg-accent-subtle border border-accent rounded-lg p-4">
          <h3 className="text-accent font-bold mb-2">Trip Summary</h3>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div>
              <span className="text-app-secondary">Actions:</span>{' '}
              <span className="text-app-primary font-bold">{totalActions}</span>
            </div>
            <div>
              <span className="text-app-secondary">Mode:</span>{' '}
              <span className="text-app-primary">{loadout.mode === 'active' ? 'Active' : 'Passive'}</span>
            </div>
            <div>
              <span className="text-app-secondary">Vehicle:</span>{' '}
              <span className="text-app-primary">
                {loadout.vehicle ? ITEMS[loadout.vehicle.itemId]?.name : 'On foot'}
              </span>
            </div>
            <div>
              <span className="text-app-secondary">Misc slots:</span>{' '}
              <span className="text-app-primary">{miscSlotCount}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Action Button */}
      <div className="p-4 bg-app-secondary border-t border-app flex-shrink-0">
        <button
          onClick={handleStartExpedition}
          disabled={!canStartExpedition}
          className={`w-full font-bold py-4 rounded-lg transition-all ${
            canStartExpedition
              ? 'bg-accent hover:bg-accent-500 text-white'
              : 'bg-app-tertiary text-app-muted cursor-not-allowed'
          }`}
        >
          {canStartExpedition ? 'Begin Expedition' : 'Add food to start'}
        </button>
      </div>

      {/* Item Picker Sheet */}
      <ItemPickerSheet />
    </div>
  );
});
