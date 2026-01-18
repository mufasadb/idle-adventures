import { observer } from 'mobx-react-lite';
import { BottomSheet } from '../layout';
import { sessionStore } from '../../stores/sessionStore';
import { playerStore } from '../../stores/playerStore';

export const MapDetailsSheet = observer(() => {
  const map = sessionStore.selectedMap;
  const cartography = playerStore.skills.find((s) => s.id === 'cartography');

  if (!map) return null;

  // Count node activities and special terrains
  const nodeCounts = map.nodes.reduce(
    (acc, node) => {
      // Count activities (mining, herbs, gems, combat)
      if (node.activity) {
        acc[node.activity] = (acc[node.activity] || 0) + 1;
      }
      // Also count special terrains like mountain
      if (node.terrain === 'mountain') {
        acc['mountain'] = (acc['mountain'] || 0) + 1;
      }
      return acc;
    },
    {} as Record<string, number>
  );

  const nodeInfo: Record<string, { icon: string; label: string; detail: string }> = {
    mining: { icon: '⛏', label: 'Iron Ore', detail: '~60-80 ore total' },
    herbs: { icon: '🌿', label: 'Alpine Herbs', detail: 'Medicinal herbs' },
    gems: { icon: '💎', label: 'Gem Pocket', detail: 'Rare gems possible' },
    combat: { icon: '🐺', label: 'Wolves', detail: 'Medium combat' },
    mountain: { icon: '▲', label: 'Mountain', detail: '+2 movement cost' },
  };

  return (
    <BottomSheet
      id="map-details"
      title={map.name}
      subtitle={`Tier ${map.tier} ${map.terrain} Region`}
      footer={
        <button
          onClick={() => sessionStore.closeSheet()}
          className="w-full bg-accent hover:bg-accent-500 text-white font-bold py-3 rounded-lg"
        >
          Select Map
        </button>
      }
    >
      {/* Map Stats */}
      <div className="bg-app-tertiary rounded-lg p-4 grid grid-cols-2 gap-4 text-sm mb-4">
        <div>
          <span className="text-app-muted">Distance</span>
          <p className="text-app-primary">{map.travelDays} days</p>
        </div>
        <div>
          <span className="text-app-muted">Terrain</span>
          <p className="text-app-primary">{map.terrain}</p>
        </div>
        <div>
          <span className="text-app-muted">Danger</span>
          <p className={`capitalize ${
            map.danger === 'high' ? 'text-red-400' :
            map.danger === 'medium' ? 'text-accent' :
            'text-green-400'
          }`}>
            {map.danger}
          </p>
        </div>
        <div>
          <span className="text-app-muted">Cartography</span>
          <p className="text-green-400">{cartography?.level || 1}</p>
        </div>
      </div>

      {/* Contents */}
      <div>
        <h3 className="text-accent text-sm font-medium mb-2">Contents</h3>
        <div className="space-y-2">
          {Object.entries(nodeCounts).map(([type, count]) => {
            const info = nodeInfo[type];
            if (!info) return null;

            return (
              <div
                key={type}
                className="flex items-center gap-3 bg-app-tertiary rounded-lg p-3"
              >
                <span className="text-xl">{info.icon}</span>
                <div>
                  <div className="text-app-primary text-sm">
                    {info.label} (x{count})
                  </div>
                  <div className="text-app-muted text-xs">{info.detail}</div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Recommendations */}
      <div className="bg-accent-subtle border border-accent rounded-lg p-4 mt-4">
        <h3 className="text-accent font-bold mb-2">Recommended</h3>
        <ul className="space-y-1 text-sm text-app-secondary">
          <li>• Food: 6+ actions worth</li>
          <li>• Mining: 20+ for full value</li>
          {nodeCounts.combat && <li>• Combat gear for wolves</li>}
        </ul>
      </div>
    </BottomSheet>
  );
});
