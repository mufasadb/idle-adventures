import { observer } from 'mobx-react-lite';
import { useEffect, useRef, useState, useCallback } from 'react';
import { Flag, Pickaxe, Leaf, Gem, Swords, Mountain, Eraser, Play, CircleUser, Fish, Trees, Waves } from 'lucide-react';
import { sessionStore } from '../../stores/sessionStore';
import { expeditionPathStore } from '../../engine/expeditionStore';
import { expeditionExecutionStore } from '../../engine/expeditionExecutionStore';
import {
  type Coord,
  coordsEqual,
  coordKey,
  type ActivityType,
  type TerrainType,
} from '../../engine/nodes';
import { FloatingResource } from '../FloatingResource';
import { ExpeditionResultsModal } from '../ExpeditionResultsModal';

const CELL_SIZE = 52;
const LONG_PRESS_MS = 400;

const ACTIVITY_ICONS: Record<ActivityType, typeof Pickaxe> = {
  mining: Pickaxe,
  herbs: Leaf,
  gems: Gem,
  combat: Swords,
  fishing: Fish,
  woodcutting: Trees,
};

/** Terrain-specific tile gradient + icon colour */
const TERRAIN_STYLES: Record<TerrainType, {
  bg: string;
  iconColor: string;
  Icon: typeof Mountain | null;
}> = {
  ground: {
    bg: 'radial-gradient(circle at 30% 25%, rgba(100,65,20,0.45), rgba(40,20,5,0.75))',
    iconColor: 'rgba(200,160,80,0.7)',
    Icon: null,
  },
  water: {
    bg: 'radial-gradient(circle at 30% 25%, rgba(20,80,160,0.6), rgba(10,30,80,0.85))',
    iconColor: 'rgba(100,180,255,0.9)',
    Icon: Waves,
  },
  mountain: {
    bg: 'radial-gradient(circle at 30% 25%, rgba(90,85,80,0.7), rgba(35,30,25,0.85))',
    iconColor: 'rgba(180,170,160,0.9)',
    Icon: Mountain,
  },
  forest: {
    bg: 'radial-gradient(circle at 30% 25%, rgba(30,80,30,0.6), rgba(10,35,10,0.85))',
    iconColor: 'rgba(100,200,80,0.9)',
    Icon: Trees,
  },
};

export const ActiveExpeditionScreen = observer(() => {
  const expedition = sessionStore.expedition;
  const map = expedition?.map;
  const viewportRef = useRef<HTMLDivElement>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);

  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const panStart = useRef({ x: 0, y: 0, offsetX: 0, offsetY: 0 });

  // Track cell positions for floating animations
  const [cellPositions, setCellPositions] = useState<Map<string, { x: number; y: number }>>(new Map());

  const executionState = expeditionExecutionStore.state;
  const isExecuting = executionState === 'running' || executionState === 'paused';

  // Center on player when map loads
  useEffect(() => {
    if (expedition && viewportRef.current) {
      expeditionPathStore.initializeFromSession();
      const vw = viewportRef.current.offsetWidth;
      const vh = viewportRef.current.offsetHeight;
      const stride = CELL_SIZE + 2;
      const px = expedition.position.x * stride + CELL_SIZE / 2;
      const py = expedition.position.y * stride + CELL_SIZE / 2;
      setOffset({ x: vw / 2 - px, y: vh / 2 - py });
    }
  }, [expedition?.map.id]);

  const CELL_STRIDE = CELL_SIZE + 2; // cell + 2px gap

  // Update cell positions when offset/scale changes
  useEffect(() => {
    if (!viewportRef.current || !map) return;

    const positions = new Map<string, { x: number; y: number }>();
    for (let y = 0; y < map.height; y++) {
      for (let x = 0; x < map.width; x++) {
        const key = coordKey({ x, y });
        const screenX = offset.x + (x * CELL_STRIDE + CELL_SIZE / 2) * scale;
        const screenY = offset.y + (y * CELL_STRIDE + CELL_SIZE / 2) * scale;
        positions.set(key, { x: screenX, y: screenY });
      }
    }
    setCellPositions(positions);
  }, [offset, scale, map, CELL_STRIDE]);

  const centerOnPlayer = useCallback(() => {
    if (!viewportRef.current || !expedition) return;
    const stride = CELL_SIZE + 2;
    const vw = viewportRef.current.offsetWidth;
    const vh = viewportRef.current.offsetHeight;
    const px = expedition.position.x * stride + CELL_SIZE / 2;
    const py = expedition.position.y * stride + CELL_SIZE / 2;
    setOffset({ x: vw / 2 - px * scale, y: vh / 2 - py * scale });
  }, [scale, expedition]);

  // Pan handlers on the viewport background
  const handlePanStart = (clientX: number, clientY: number) => {
    if (isExecuting) return; // Disable panning during execution
    setIsPanning(true);
    panStart.current = { x: clientX, y: clientY, offsetX: offset.x, offsetY: offset.y };
  };

  const handlePanMove = (clientX: number, clientY: number) => {
    if (!isPanning) return;
    setOffset({
      x: panStart.current.offsetX + (clientX - panStart.current.x),
      y: panStart.current.offsetY + (clientY - panStart.current.y),
    });
  };

  const handlePanEnd = () => setIsPanning(false);

  const handleWheel = (e: React.WheelEvent) => {
    const delta = e.deltaY > 0 ? -0.1 : 0.1;
    setScale((s) => Math.max(0.5, Math.min(2, s + delta)));
  };

  const handleConfirmPath = () => {
    expeditionExecutionStore.confirmAndStart();
  };

  if (!expedition || !map) return null;

  const bagCount = expedition.bag.reduce((sum, s) => sum + s.count, 0);
  const { affordablePath, pathCost, path } = expeditionPathStore;
  const hasPath = path.length > 0;
  const canConfirm = hasPath && affordablePath.path.length > 0 && !isExecuting;

  return (
    <div className="flex flex-col h-full bg-app-primary">
      {/* Header */}
      <div className="bg-app-secondary px-4 py-2 border-b border-app flex-shrink-0">
        <div className="flex justify-between items-center">
          <span className="text-accent font-bold">{map.name}</span>
          {!isExecuting && executionState !== 'completed' && (
            <button
              onClick={() => sessionStore.endExpedition()}
              className="text-app-muted text-sm hover:text-app-primary"
            >
              Return Home
            </button>
          )}
          {isExecuting && (
            <span className="text-sm text-yellow-400">
              Exploring... {expeditionExecutionStore.progressPercent}%
            </span>
          )}
        </div>
        <div className="flex justify-between text-xs text-app-muted mt-1">
          <span>Actions: {expedition.actionsRemaining}/{expedition.actionsTotal}</span>
          {!isExecuting && <span>Path cost: {pathCost.totalCost}</span>}
        </div>
      </div>

      {/* Map Viewport */}
      <div
        ref={viewportRef}
        className="flex-1 relative bg-app-primary overflow-hidden touch-none"
        onMouseDown={(e) => handlePanStart(e.clientX, e.clientY)}
        onMouseMove={(e) => handlePanMove(e.clientX, e.clientY)}
        onMouseUp={handlePanEnd}
        onMouseLeave={handlePanEnd}
        onTouchStart={(e) => e.touches.length === 1 && handlePanStart(e.touches[0].clientX, e.touches[0].clientY)}
        onTouchMove={(e) => e.touches.length === 1 && handlePanMove(e.touches[0].clientX, e.touches[0].clientY)}
        onTouchEnd={handlePanEnd}
        onWheel={handleWheel}
      >
        {/* Minimap */}
        <div className="absolute top-2 right-2 w-20 h-20 bg-app-secondary border border-app rounded-lg overflow-hidden z-20 pointer-events-none">
          <div
            className="absolute border-2 border-accent bg-accent/20"
            style={{
              width: `${(viewportRef.current?.offsetWidth || 100) / (map.width * CELL_SIZE) / scale * 100}%`,
              height: `${(viewportRef.current?.offsetHeight || 100) / (map.height * CELL_SIZE) / scale * 100}%`,
              left: `${Math.max(0, -offset.x / scale / (map.width * CELL_SIZE) * 100)}%`,
              top: `${Math.max(0, -offset.y / scale / (map.height * CELL_SIZE) * 100)}%`,
            }}
          />
        </div>

        {/* Controls - only show when not executing */}
        {!isExecuting && executionState !== 'completed' && (
          <div className="absolute bottom-3 right-3 flex flex-col gap-1 z-20">
            <button
              onClick={() => setScale((s) => Math.min(2, s + 0.2))}
              className="w-9 h-9 bg-app-secondary border border-app rounded-lg flex items-center justify-center text-app-primary text-xl font-bold hover:bg-app-hover"
            >
              +
            </button>
            <button
              onClick={() => setScale((s) => Math.max(0.5, s - 0.2))}
              className="w-9 h-9 bg-app-secondary border border-app rounded-lg flex items-center justify-center text-app-primary text-xl font-bold hover:bg-app-hover"
            >
              -
            </button>
            <button
              onClick={centerOnPlayer}
              className="w-9 h-9 bg-app-secondary border border-app rounded-lg flex items-center justify-center text-app-primary hover:bg-app-hover"
            >
              <Flag size={16} />
            </button>
            <button
              onClick={() => expeditionPathStore.toggleEraserMode()}
              className={`w-9 h-9 border rounded-lg flex items-center justify-center transition-colors ${
                expeditionPathStore.eraserMode
                  ? 'bg-red-500/20 border-red-500 text-red-400'
                  : 'bg-app-secondary border-app text-app-muted hover:bg-app-hover'
              }`}
            >
              <Eraser size={16} />
            </button>
            <button
              onClick={() => expeditionPathStore.clearPath()}
              className="w-9 h-9 bg-app-secondary border border-app rounded-lg flex items-center justify-center text-red-400 hover:bg-app-hover text-xs font-bold"
            >
              CLR
            </button>
          </div>
        )}

        {/* Map Container */}
        <div
          ref={mapContainerRef}
          className="absolute origin-top-left"
          style={{ transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})` }}
        >
          {/* SVG Path Line */}
          <svg
            className="absolute top-0 left-0 pointer-events-none"
            width={map.width * (CELL_SIZE + 2)}
            height={map.height * (CELL_SIZE + 2)}
            style={{ zIndex: 5 }}
          >
            {isExecuting ? (
              <ExecutionPathLine
                executionPath={expeditionExecutionStore.executionPath}
                currentIndex={expeditionExecutionStore.currentIndex}
              />
            ) : (
              <PathLine path={path} affordablePath={affordablePath.path} />
            )}
          </svg>

          {/* Grid */}
          <div
            className="grid"
            style={{
              gridTemplateColumns: `repeat(${map.width}, ${CELL_SIZE}px)`,
              gap: 2,
            }}
          >
            {map.nodes.map((node, i) => {
              const coord = node.coord;
              const isPlayerHere = coordsEqual(coord, expedition.position);
              const isOnPath = isExecuting
                ? expeditionExecutionStore.executionPath.some(c => coordsEqual(c, coord))
                : expeditionPathStore.isOnPath(coord);
              const hasActivity = !!node.activity;
              const isActivityActive = hasActivity && (
                isExecuting
                  ? expeditionExecutionStore.activeActivities.has(coordKey(coord))
                  : expeditionPathStore.isActivityActive(coord)
              );
              const isCurrentExecution = !!(isExecuting &&
                expeditionExecutionStore.currentPosition &&
                coordsEqual(coord, expeditionExecutionStore.currentPosition));

              return (
                <GridCell
                  key={i}
                  coord={coord}
                  terrain={node.terrain}
                  isPlayerHere={isPlayerHere}
                  isOnPath={isOnPath}
                  hasActivity={hasActivity}
                  isActivityActive={isActivityActive}
                  activity={node.activity}
                  isExecuting={isExecuting}
                  isCurrentExecution={isCurrentExecution}
                />
              );
            })}
          </div>
        </div>

        {/* Floating resource animations */}
        {expeditionExecutionStore.animatingResources.map((resource) => {
          const pos = cellPositions.get(coordKey(resource.coord));
          if (!pos) return null;
          return (
            <FloatingResource
              key={resource.timestamp}
              itemId={resource.itemId}
              count={resource.count}
              x={pos.x}
              y={pos.y}
              onComplete={() => expeditionExecutionStore.clearAnimatingResource(resource.timestamp)}
            />
          );
        })}
      </div>

      {/* Legend */}
      <div className="bg-app-secondary p-2 border-t border-app flex-shrink-0">
        <div className="flex justify-between items-center text-xs text-app-muted flex-wrap gap-1">
          <span className="flex items-center gap-0.5"><Pickaxe size={11} /> Mine</span>
          <span className="flex items-center gap-0.5"><Leaf size={11} /> Herb</span>
          <span className="flex items-center gap-0.5"><Gem size={11} /> Gem</span>
          <span className="flex items-center gap-0.5"><Swords size={11} /> Combat</span>
          <span className="flex items-center gap-0.5"><Fish size={11} /> Fish</span>
          <span className="flex items-center gap-0.5"><Mountain size={11} /> Mtn</span>
          <span className="flex items-center gap-0.5"><Trees size={11} /> Forest</span>
          <span className="flex items-center gap-0.5"><Waves size={11} /> Water</span>
        </div>
      </div>

      {/* Footer */}
      <div className="bg-app-secondary px-4 py-3 border-t border-app flex-shrink-0">
        <div className="flex justify-between items-center">
          <div className="text-app-muted text-sm">
            <span className="mr-4">Bag: {bagCount}</span>
            {!isExecuting && !affordablePath.isComplete && hasPath && (
              <span className="text-yellow-400">Path exceeds budget!</span>
            )}
          </div>

          {/* Confirm button or execution status */}
          {!isExecuting && executionState !== 'completed' ? (
            <button
              onClick={handleConfirmPath}
              disabled={!canConfirm}
              className={`px-4 py-2 rounded-lg font-bold flex items-center gap-2 transition-colors ${
                canConfirm
                  ? 'bg-accent text-white hover:bg-accent/90'
                  : 'bg-app-tertiary text-app-muted cursor-not-allowed'
              }`}
            >
              <Play size={16} />
              Confirm Path
            </button>
          ) : isExecuting ? (
            <div className="text-accent font-bold flex items-center gap-2">
              <CircleUser size={16} className="animate-pulse" />
              Exploring...
            </div>
          ) : null}
        </div>
      </div>

      {/* Results modal */}
      <ExpeditionResultsModal />
    </div>
  );
});

// ============================================
// GridCell - handles tap and long-press
// ============================================

interface GridCellProps {
  coord: Coord;
  terrain: TerrainType;
  isPlayerHere: boolean;
  isOnPath: boolean;
  hasActivity: boolean;
  isActivityActive: boolean;
  activity?: ActivityType;
  isExecuting?: boolean;
  isCurrentExecution?: boolean;
}

const GridCell = observer(({
  coord,
  terrain,
  isPlayerHere,
  isOnPath,
  hasActivity,
  isActivityActive,
  activity,
  isExecuting = false,
  isCurrentExecution = false,
}: GridCellProps) => {
  const pressTimer = useRef<number | null>(null);
  const didLongPress = useRef(false);

  const handlePointerDown = (e: React.PointerEvent) => {
    if (isExecuting) return;
    e.stopPropagation();
    didLongPress.current = false;
    pressTimer.current = window.setTimeout(() => {
      didLongPress.current = true;
      expeditionPathStore.toggleActivity(coord);
    }, LONG_PRESS_MS);
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (isExecuting) return;
    e.stopPropagation();
    if (pressTimer.current) {
      clearTimeout(pressTimer.current);
      pressTimer.current = null;
    }
    if (!didLongPress.current) {
      expeditionPathStore.handleTileTap(coord);
    }
  };

  const handlePointerLeave = () => {
    if (pressTimer.current) {
      clearTimeout(pressTimer.current);
      pressTimer.current = null;
    }
  };

  const terrainStyle = TERRAIN_STYLES[terrain];

  // Determine what to render inside the tile
  let content: React.ReactNode = null;
  if (isPlayerHere) {
    content = <Flag size={18} color="rgba(56,189,248,1)" />;
  } else if (hasActivity && activity) {
    const ActivityIcon = ACTIVITY_ICONS[activity];
    const iconColor = isActivityActive ? 'rgba(255,255,255,0.95)' : 'rgba(200,200,200,0.7)';
    content = <ActivityIcon size={18} color={iconColor} />;
  } else if (terrainStyle.Icon) {
    // Show terrain icon (mountain, water, forest) only when no activity
    const TerrainIcon = terrainStyle.Icon;
    content = <TerrainIcon size={16} color={terrainStyle.iconColor} />;
  }

  // Overlay color when on path
  const pathOverlay = isOnPath ? 'rgba(56,189,248,0.18)' : 'transparent';

  // Border for activity state
  let borderStyle = '1.5px solid rgba(80,50,15,0.5)';
  if (isCurrentExecution) {
    borderStyle = '2px solid rgba(250,204,21,0.9)';
  } else if (isOnPath && hasActivity) {
    borderStyle = isActivityActive
      ? '2px solid rgba(34,197,94,0.9)'
      : '2px solid rgba(239,68,68,0.8)';
  } else if (isOnPath) {
    borderStyle = '1.5px solid rgba(56,189,248,0.5)';
  }

  return (
    <div
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerLeave}
      onPointerCancel={handlePointerLeave}
      className="select-none touch-none transition-all"
      style={{
        width: CELL_SIZE,
        height: CELL_SIZE,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 4,
        background: terrainStyle.bg,
        border: borderStyle,
        boxShadow: isCurrentExecution
          ? '0 0 0 3px rgba(250,204,21,0.4)'
          : 'inset 0 1px 3px rgba(0,0,0,0.5)',
        cursor: isExecuting ? 'default' : 'pointer',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Path overlay tint */}
      {isOnPath && (
        <div style={{
          position: 'absolute', inset: 0,
          background: pathOverlay,
          pointerEvents: 'none',
        }} />
      )}
      {content}
    </div>
  );
});

// ============================================
// PathLine - SVG path visualization (planning mode)
// ============================================

interface PathLineProps {
  path: Coord[];
  affordablePath: Coord[];
}

const PathLine = ({ path, affordablePath }: PathLineProps) => {
  if (path.length < 2) return null;

  const stride = CELL_SIZE + 2;
  const half = CELL_SIZE / 2;

  const toD = (coords: Coord[]) =>
    coords.map((c, i) => {
      const x = c.x * stride + half;
      const y = c.y * stride + half;
      return i === 0 ? `M ${x} ${y}` : `L ${x} ${y}`;
    }).join(' ');

  const fullD = toD(path);
  const affordableD = toD(affordablePath);
  const hasUnaffordable = affordablePath.length < path.length;

  return (
    <>
      {hasUnaffordable && (
        <path
          d={fullD}
          fill="none"
          stroke="rgba(239, 68, 68, 0.5)"
          strokeWidth={4}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray="8 4"
        />
      )}
      <path
        d={affordableD}
        fill="none"
        stroke="rgba(56, 189, 248, 0.8)"
        strokeWidth={4}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </>
  );
};

// ============================================
// ExecutionPathLine - SVG path visualization (execution mode)
// ============================================

interface ExecutionPathLineProps {
  executionPath: Coord[];
  currentIndex: number;
}

const ExecutionPathLine = ({ executionPath, currentIndex }: ExecutionPathLineProps) => {
  if (executionPath.length < 2) return null;

  const stride = CELL_SIZE + 2;
  const half = CELL_SIZE / 2;

  const toD = (coords: Coord[]) =>
    coords.map((c, i) => {
      const x = c.x * stride + half;
      const y = c.y * stride + half;
      return i === 0 ? `M ${x} ${y}` : `L ${x} ${y}`;
    }).join(' ');

  const completedPath = executionPath.slice(0, currentIndex + 1);
  const remainingPath = executionPath.slice(currentIndex);

  const completedD = toD(completedPath);
  const remainingD = toD(remainingPath);

  return (
    <>
      {/* Remaining path (dimmed) */}
      {remainingPath.length >= 2 && (
        <path
          d={remainingD}
          fill="none"
          stroke="rgba(56, 189, 248, 0.3)"
          strokeWidth={4}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray="8 4"
        />
      )}
      {/* Completed path (bright) */}
      {completedPath.length >= 2 && (
        <path
          d={completedD}
          fill="none"
          stroke="rgba(34, 197, 94, 0.8)"
          strokeWidth={4}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}
    </>
  );
};
