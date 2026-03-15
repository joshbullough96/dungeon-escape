const TILE = {
  WALL: '#',
  FLOOR: '.',
  PLAYER: 'P',
  KEY: 'K',
  DOOR: 'D',
  EXIT: 'E'
};

const STAGE_COUNT = 30;
const EFFECT_DURATION_MS = 10000;

const HAZARD_TYPES = {
  trap: {
    unlockStage: 1,
    className: 'trap',
    symbol: '\u26A0',
    weight: 3
  },
  spikes: {
    unlockStage: 3,
    className: 'spikes',
    symbol: '\u2737',
    weight: 3
  },
  poison: {
    unlockStage: 8,
    className: 'poison',
    symbol: '\u2620',
    weight: 2
  },
  arrows: {
    unlockStage: 13,
    className: 'arrows',
    symbol: '\u27B3',
    weight: 2
  },
  fire: {
    unlockStage: 18,
    className: 'fire',
    symbol: '\u{1F525}',
    weight: 2
  },
  zombie: {
    unlockStage: 23,
    className: 'zombie',
    symbol: '\u{1F9DF}',
    weight: 1
  }
};

const ITEM_TYPES = {
  loot: {
    unlockStage: 1,
    className: 'treasure',
    symbol: '\u{1F4B0}'
  },
  gem: {
    unlockStage: 6,
    className: 'gem',
    symbol: '\u{1F48E}'
  },
  meat: {
    unlockStage: 3,
    className: 'heal',
    symbol: '\u{1F356}'
  },
  flashlight: {
    unlockStage: 8,
    className: 'power',
    symbol: '\u{1F526}'
  },
  shield: {
    unlockStage: 15,
    className: 'power',
    symbol: '\u{1F6E1}'
  }
};

const boardEl = document.getElementById('board');
const stageEl = document.getElementById('stage');
const movesEl = document.getElementById('moves');
const healthEl = document.getElementById('health');
const keyCountEl = document.getElementById('keyCount');
const lootEl = document.getElementById('loot');
const messageEl = document.getElementById('message');
const effectStatusEl = document.getElementById('effectStatus');
const restartBtn = document.getElementById('restartBtn');
const newMapBtn = document.getElementById('newMapBtn');
const settingsBtn = document.getElementById('settingsBtn');
const settingsModal = document.getElementById('settingsModal');
const closeSettingsBtn = document.getElementById('closeSettingsBtn');
const modalBackdrop = document.getElementById('modalBackdrop');
const fogToggle = document.getElementById('fogToggle');
const touchButtons = document.querySelectorAll('.touch-btn');
const compactLayoutQuery = window.matchMedia('(max-width: 560px)');

let state = null;
let currentStageIndex = 0;
let nextStageTimeoutId = null;
let totalLoot = 0;
let compactBoardEnabled = compactLayoutQuery.matches;
let isStageTransitioning = false;

const effectTimeoutIds = {
  flashlight: null,
  shield: null
};

const settings = {
  fogOfWarEnabled: true
};

function createSeededRandom(seed) {
  let value = seed >>> 0;

  return function seededRandom() {
    value += 0x6D2B79F5;
    let result = Math.imul(value ^ value >>> 15, value | 1);
    result ^= result + Math.imul(result ^ result >>> 7, result | 61);
    return ((result ^ result >>> 14) >>> 0) / 4294967296;
  };
}

function getPositionKey(x, y) {
  return `${x},${y}`;
}

function getRandomInt(min, max, rng = Math.random) {
  return Math.floor(rng() * (max - min + 1)) + min;
}

function shuffle(items, rng = Math.random) {
  const copy = [...items];

  for (let index = copy.length - 1; index > 0; index--) {
    const swapIndex = getRandomInt(0, index, rng);
    [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
  }

  return copy;
}

function chooseWeightedType(weightedTypes, rng) {
  const totalWeight = weightedTypes.reduce((sum, entry) => sum + entry.weight, 0);
  let threshold = rng() * totalWeight;

  for (const entry of weightedTypes) {
    threshold -= entry.weight;
    if (threshold <= 0) {
      return entry.type;
    }
  }

  return weightedTypes[weightedTypes.length - 1].type;
}

function createGrid(size, fill = TILE.WALL) {
  return Array.from({ length: size }, () => Array(size).fill(fill));
}

function getReachableData(grid, start, canOpenDoor) {
  const queue = [{ x: start.x, y: start.y, distance: 0 }];
  const visited = new Set([getPositionKey(start.x, start.y)]);
  const distances = new Map([[getPositionKey(start.x, start.y), 0]]);
  const directions = [
    [0, -1],
    [1, 0],
    [0, 1],
    [-1, 0]
  ];

  while (queue.length > 0) {
    const current = queue.shift();

    for (const [dx, dy] of directions) {
      const nextX = current.x + dx;
      const nextY = current.y + dy;
      const nextTile = grid[nextY]?.[nextX];
      const nextKey = getPositionKey(nextX, nextY);

      if (!nextTile || visited.has(nextKey) || nextTile === TILE.WALL) {
        continue;
      }

      if (nextTile === TILE.DOOR && !canOpenDoor) {
        continue;
      }

      visited.add(nextKey);
      distances.set(nextKey, current.distance + 1);
      queue.push({ x: nextX, y: nextY, distance: current.distance + 1 });
    }
  }

  return { visited, distances };
}

function getBitCount(value) {
  let count = 0;
  let current = value;

  while (current > 0) {
    count += current & 1;
    current >>= 1;
  }

  return count;
}

function getProgressionReachableData(grid, start, keyPositions, doorPositions) {
  const keyIndexByPosition = new Map(
    keyPositions.map((position, index) => [getPositionKey(position.x, position.y), index])
  );
  const doorIndexByPosition = new Map(
    doorPositions.map((position, index) => [getPositionKey(position.x, position.y), index])
  );
  const startKey = getPositionKey(start.x, start.y);
  const queue = [{ x: start.x, y: start.y, keyMask: 0, doorMask: 0, distance: 0 }];
  const visitedStates = new Set([`0,0,${startKey}`]);
  const visitedTiles = new Set([startKey]);
  const distances = new Map([[startKey, 0]]);
  const directions = [
    [0, -1],
    [1, 0],
    [0, 1],
    [-1, 0]
  ];

  while (queue.length > 0) {
    const current = queue.shift();
    const currentTile = grid[current.y]?.[current.x];

    if (currentTile === TILE.EXIT) {
      continue;
    }

    for (const [dx, dy] of directions) {
      const nextX = current.x + dx;
      const nextY = current.y + dy;
      const nextTile = grid[nextY]?.[nextX];

      if (!nextTile || nextTile === TILE.WALL) {
        continue;
      }

      let nextKeyMask = current.keyMask;
      let nextDoorMask = current.doorMask;
      const nextPositionKey = getPositionKey(nextX, nextY);
      const doorIndex = doorIndexByPosition.get(nextPositionKey);

      if (doorIndex !== undefined) {
        const isDoorOpen = (nextDoorMask & (1 << doorIndex)) !== 0;
        const keysHeld = getBitCount(nextKeyMask) - getBitCount(nextDoorMask);

        if (!isDoorOpen) {
          if (keysHeld <= 0) {
            continue;
          }

          nextDoorMask |= 1 << doorIndex;
        }
      }

      const keyIndex = keyIndexByPosition.get(nextPositionKey);
      if (keyIndex !== undefined) {
        nextKeyMask |= 1 << keyIndex;
      }

      const stateKey = `${nextKeyMask},${nextDoorMask},${nextPositionKey}`;
      if (visitedStates.has(stateKey)) {
        continue;
      }

      visitedStates.add(stateKey);
      visitedTiles.add(nextPositionKey);

      if (!distances.has(nextPositionKey) || current.distance + 1 < distances.get(nextPositionKey)) {
        distances.set(nextPositionKey, current.distance + 1);
      }

      queue.push({
        x: nextX,
        y: nextY,
        keyMask: nextKeyMask,
        doorMask: nextDoorMask,
        distance: current.distance + 1
      });
    }
  }

  return { visited: visitedTiles, distances };
}

function canReachAll(grid, start, targets, canOpenDoor) {
  const visited = getReachableData(grid, start, canOpenDoor).visited;
  return targets.every(target => visited.has(getPositionKey(target.x, target.y)));
}

function chooseFarthestPosition(grid, start, filterFn, rng) {
  const distances = getReachableData(grid, start, true).distances;
  const candidates = [];

  for (const [key, distance] of distances.entries()) {
    const [x, y] = key.split(',').map(Number);
    if (!filterFn(x, y, distance)) {
      continue;
    }

    candidates.push({ x, y, distance });
  }

  if (candidates.length === 0) {
    return null;
  }

  candidates.sort((a, b) => b.distance - a.distance);
  return shuffle(candidates.slice(0, Math.max(1, Math.ceil(candidates.length * 0.25))), rng)[0];
}

function attemptWallPlacement(grid, candidates, attempts, connectivityChecks, rng) {
  const pool = shuffle(candidates, rng);
  let placed = 0;

  for (const position of pool) {
    if (placed >= attempts) {
      break;
    }

    if (grid[position.y][position.x] !== TILE.FLOOR) {
      continue;
    }

    const previousTile = grid[position.y][position.x];
    grid[position.y][position.x] = TILE.WALL;

    const isSafe = connectivityChecks.every(check => {
      return canReachAll(grid, check.start, check.targets, check.canOpenDoor);
    });

    if (isSafe) {
      placed += 1;
    } else {
      grid[position.y][position.x] = previousTile;
    }
  }
}

function addRouteSegment(routeKeys, start, end) {
  let currentX = start.x;
  let currentY = start.y;
  routeKeys.add(getPositionKey(currentX, currentY));

  while (currentX !== end.x) {
    currentX += currentX < end.x ? 1 : -1;
    routeKeys.add(getPositionKey(currentX, currentY));
  }

  while (currentY !== end.y) {
    currentY += currentY < end.y ? 1 : -1;
    routeKeys.add(getPositionKey(currentX, currentY));
  }
}

function createStageGenerationContext() {
  return {
    TILE,
    compactBoardEnabled,
    createSeededRandom,
    getRandomInt,
    shuffle,
    createGrid,
    getReachableData,
    canReachAll,
    chooseFarthestPosition,
    attemptWallPlacement,
    addRouteSegment,
    getPositionKey
  };
}

function findTilePosition(grid, targetTile) {
  for (let y = 0; y < grid.length; y++) {
    for (let x = 0; x < grid[y].length; x++) {
      if (grid[y][x] === targetTile) {
        return { x, y };
      }
    }
  }

  return null;
}

function getFloorPositions(grid, reachableKeys, blockedKeys = new Set()) {
  const positions = [];

  for (let y = 0; y < grid.length; y++) {
    for (let x = 0; x < grid[y].length; x++) {
      const key = getPositionKey(x, y);
      if (grid[y][x] !== TILE.FLOOR || blockedKeys.has(key)) {
        continue;
      }

      if (reachableKeys && !reachableKeys.has(key)) {
        continue;
      }

      positions.push({ x, y });
    }
  }

  return positions;
}

function getUnlockedHazardTypes(stageNumber) {
  return Object.entries(HAZARD_TYPES)
    .filter(([, config]) => stageNumber >= config.unlockStage)
    .map(([type, config]) => ({ type, weight: config.weight }));
}

function chooseLootItems(grid, player, stageNumber, blockedKeys, progressionReachable, lootProfile = null) {
  const reachableWithoutDoor = getReachableData(grid, player, false).visited;
  const reachableFloors = getFloorPositions(grid, progressionReachable.visited, blockedKeys);
  const exitPosition = findTilePosition(grid, TILE.EXIT);
  const extraLootBags = lootProfile?.extraLootBags ?? 0;
  const lootValueBonus = lootProfile?.lootValueBonus ?? 0;
  const gemChance = lootProfile?.gemChance ?? 0.45;
  const guaranteedGems = lootProfile?.guaranteedGems ?? 0;
  const lockedAreaFloors = reachableFloors.filter(position => {
    return !reachableWithoutDoor.has(getPositionKey(position.x, position.y));
  });

  let farFromExitFloors = [];
  if (exitPosition) {
    const distanceData = getReachableData(grid, exitPosition, true).distances;
    const sortedByDistance = [...reachableFloors]
      .map(position => ({
        ...position,
        distance: distanceData.get(getPositionKey(position.x, position.y)) ?? 0
      }))
      .sort((a, b) => b.distance - a.distance);
    farFromExitFloors = sortedByDistance.slice(0, Math.max(1, Math.ceil(sortedByDistance.length * 0.35)));
  }

  const desiredCount = Math.min(reachableFloors.length, 2 + Math.floor((stageNumber - 1) / 10) + extraLootBags);
  const chosenKeys = new Set();
  const items = [];

  function takePosition(pool) {
    const candidate = shuffle(pool).find(position => !chosenKeys.has(getPositionKey(position.x, position.y)));
    if (!candidate) {
      return null;
    }

    chosenKeys.add(getPositionKey(candidate.x, candidate.y));
    return candidate;
  }

  if (lockedAreaFloors.length > 0 && Math.random() < 0.7) {
    const position = takePosition(lockedAreaFloors);
    if (position) {
      items.push({
        x: position.x,
        y: position.y,
        type: 'loot',
        value: getRandomInt(15 + lootValueBonus, 35 + Math.floor(stageNumber / 2) + lootValueBonus)
      });
    }
  }

  if (farFromExitFloors.length > 0 && items.length < desiredCount) {
    const position = takePosition(farFromExitFloors);
    if (position) {
      items.push({
        x: position.x,
        y: position.y,
        type: 'loot',
        value: getRandomInt(15 + lootValueBonus, 35 + Math.floor(stageNumber / 2) + lootValueBonus)
      });
    }
  }

  while (items.length < desiredCount) {
    const position = takePosition(reachableFloors);
    if (!position) {
      break;
    }

    items.push({
      x: position.x,
      y: position.y,
      type: 'loot',
      value: getRandomInt(15 + lootValueBonus, 35 + Math.floor(stageNumber / 2) + lootValueBonus)
    });
  }

  if (stageNumber >= ITEM_TYPES.gem.unlockStage && reachableFloors.length > items.length) {
    let gemsToPlace = guaranteedGems;

    if (Math.random() < gemChance) {
      gemsToPlace += 1;
    }

    while (gemsToPlace > 0 && reachableFloors.length > items.length) {
      const position = takePosition(farFromExitFloors.length > 0 ? farFromExitFloors : reachableFloors);
      if (!position) {
        break;
      }

      items.push({
        x: position.x,
        y: position.y,
        type: 'gem',
        value: 100
      });
      gemsToPlace -= 1;
    }
  }

  return items;
}

function chooseSupportItems(grid, stageNumber, blockedKeys, occupiedKeys, progressionReachable) {
  const candidatePositions = getFloorPositions(
    grid,
    progressionReachable.visited,
    new Set([...blockedKeys, ...occupiedKeys])
  );
  const chosenKeys = new Set();
  const items = [];

  function maybePlace(type, chance) {
    if (stageNumber < ITEM_TYPES[type].unlockStage || Math.random() > chance) {
      return;
    }

    const position = shuffle(candidatePositions).find(candidate => {
      return !chosenKeys.has(getPositionKey(candidate.x, candidate.y));
    });

    if (!position) {
      return;
    }

    chosenKeys.add(getPositionKey(position.x, position.y));
    items.push({ x: position.x, y: position.y, type });
  }

  maybePlace('meat', 0.35);
  maybePlace('flashlight', 0.3);
  maybePlace('shield', 0.25);

  return items;
}

function placeHazards(grid, stageNumber, blockedKeys, occupiedKeys, rng, progressionReachable) {
  const available = getFloorPositions(
    grid,
    progressionReachable.visited,
    new Set([...blockedKeys, ...occupiedKeys])
  );
  const hazardCount = Math.min(
    2 + Math.floor((stageNumber - 1) / 3),
    Math.max(2, Math.floor((grid.length - 2) * 0.8))
  );
  const unlockedTypes = getUnlockedHazardTypes(stageNumber);
  const hazards = [];

  for (const position of shuffle(available, rng).slice(0, hazardCount)) {
    hazards.push({
      x: position.x,
      y: position.y,
      type: chooseWeightedType(unlockedTypes, rng)
    });
  }

  return hazards;
}

function getLootItemAt(x, y) {
  return state.lootItems.find(item => item.x === x && item.y === y) ?? null;
}

function getSupportItemAt(x, y) {
  return state.supportItems.find(item => item.x === x && item.y === y) ?? null;
}

function getHazardAt(x, y) {
  return state.hazards.find(item => item.x === x && item.y === y) ?? null;
}

function buildState(index, loot = totalLoot, health = 3) {
  const stageNumber = index + 1;
  const stageData = StageGeneration.createStageData(stageNumber, createStageGenerationContext());
  console.info(
    `[Stage ${stageNumber}] method=${stageData.method}` +
    (stageData.templateId ? ` template=${stageData.templateId}` : '')
  );
  const grid = stageData.rows.map(row => row.split(''));
  const reservedKeys = new Set(stageData.reservedKeys);
  let player = { x: 0, y: 0 };

  for (let y = 0; y < grid.length; y++) {
    for (let x = 0; x < grid[y].length; x++) {
      if (grid[y][x] === TILE.PLAYER) {
        player = { x, y };
        grid[y][x] = TILE.FLOOR;
      }
    }
  }

  const progressionReachable = getProgressionReachableData(
    grid,
    player,
    stageData.keyPositions,
    stageData.barrierDoors
  );
  const lootBlockedKeys = stageData.lootProfile?.allowDensePlacement
    ? new Set([getPositionKey(player.x, player.y)])
    : reservedKeys;
  const lootItems = chooseLootItems(
    grid,
    player,
    stageNumber,
    lootBlockedKeys,
    progressionReachable,
    stageData.lootProfile
  );
  const lootKeys = lootItems.map(item => getPositionKey(item.x, item.y));
  const supportItems = chooseSupportItems(grid, stageNumber, reservedKeys, lootKeys, progressionReachable);
  const supportKeys = supportItems.map(item => getPositionKey(item.x, item.y));
  const rng = createSeededRandom(stageNumber * 918273645);
  const hazards = placeHazards(
    grid,
    stageNumber,
    reservedKeys,
    [...lootKeys, ...supportKeys],
    rng,
    progressionReachable
  );

  return {
    grid,
    player,
    stageIndex: index,
    stageNumber,
    moves: 0,
    health,
    maxHealth: 5,
    loot,
    mapStartLoot: loot,
    mapStartHealth: health,
    stageName: stageData.stageName ?? null,
    lootItems,
    supportItems,
    hazards,
    effects: {
      flashlightUntil: 0,
      shieldUntil: 0
    },
    poisonTicks: 0,
    burnTicks: 0,
    keys: 0,
    gameOver: false,
    won: false
  };
}

function setMessage(text) {
  messageEl.textContent = text;
}

function clearNextStageTimeout() {
  if (nextStageTimeoutId !== null) {
    clearTimeout(nextStageTimeoutId);
    nextStageTimeoutId = null;
  }

  isStageTransitioning = false;
}

function clearEffectTimeouts() {
  for (const key of Object.keys(effectTimeoutIds)) {
    if (effectTimeoutIds[key] !== null) {
      clearTimeout(effectTimeoutIds[key]);
      effectTimeoutIds[key] = null;
    }
  }
}

function isFlashlightActive() {
  return state && state.effects.flashlightUntil > Date.now();
}

function isShieldActive() {
  return state && state.effects.shieldUntil > Date.now();
}

function updateEffectStatus() {
  const active = [];

  if (isFlashlightActive()) {
    active.push('Flashlight');
  }

  if (isShieldActive()) {
    active.push('Shield');
  }

  if (state.poisonTicks > 0) {
    active.push(`Poisoned (${state.poisonTicks})`);
  }

  if (state.burnTicks > 0) {
    active.push(`Burning (${state.burnTicks})`);
  }

  effectStatusEl.textContent = active.length > 0
    ? `Active: ${active.join(' | ')}`
    : 'No active effects.';
}

function updateStats() {
  stageEl.textContent = state.stageNumber;
  movesEl.textContent = state.moves;
  healthEl.textContent = state.health;
  keyCountEl.textContent = state.keys;
  lootEl.textContent = state.loot;
  newMapBtn.disabled = state.stageNumber >= STAGE_COUNT || isStageTransitioning;
  updateEffectStatus();
}

function getTileClass(tile, isPlayer, lootItem, supportItem, hazard) {
  if (isPlayer) return 'player';
  if (supportItem) return ITEM_TYPES[supportItem.type].className;
  if (lootItem) return ITEM_TYPES[lootItem.type].className;
  if (hazard) return HAZARD_TYPES[hazard.type].className;

  switch (tile) {
    case TILE.WALL: return 'wall';
    case TILE.KEY: return 'key';
    case TILE.DOOR: return 'door';
    case TILE.EXIT: return 'exit';
    default: return 'floor';
  }
}

function getTileSymbol(tile, isPlayer, lootItem, supportItem, hazard) {
  if (isPlayer) return state.gameOver && !state.won ? '\u{1FAA6}' : '\u{1F9D9}';
  if (supportItem) return ITEM_TYPES[supportItem.type].symbol;
  if (lootItem) return ITEM_TYPES[lootItem.type].symbol;
  if (hazard) return HAZARD_TYPES[hazard.type].symbol;

  switch (tile) {
    case TILE.KEY: return '\u{1F5DD}\uFE0F';
    case TILE.DOOR: return '\u{1F6AA}';
    case TILE.EXIT: return '\u2B06';
    default: return '';
  }
}

function isTileVisible(x, y) {
  if (!settings.fogOfWarEnabled || isFlashlightActive()) {
    return true;
  }

  if (compactBoardEnabled) {
    return x >= state.player.x - 1 &&
      x <= state.player.x + 2 &&
      y >= state.player.y - 1 &&
      y <= state.player.y + 2;
  }

  return Math.abs(state.player.x - x) <= 2 && Math.abs(state.player.y - y) <= 2;
}

function openSettingsModal() {
  settingsModal.classList.remove('hidden-modal');
  settingsModal.setAttribute('aria-hidden', 'false');
  fogToggle.checked = settings.fogOfWarEnabled;
}

function closeSettingsModal() {
  settingsModal.classList.add('hidden-modal');
  settingsModal.setAttribute('aria-hidden', 'true');
}

function render() {
  const rows = state.grid.length;
  const cols = state.grid[0].length;
  boardEl.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;
  boardEl.innerHTML = '';

  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const tile = state.grid[y][x];
      const isPlayer = state.player.x === x && state.player.y === y;
      const lootItem = getLootItemAt(x, y);
      const supportItem = getSupportItemAt(x, y);
      const hazard = getHazardAt(x, y);
      const isVisible = isTileVisible(x, y);
      const tileEl = document.createElement('div');
      tileEl.className = isVisible
        ? `tile revealed ${getTileClass(tile, isPlayer, lootItem, supportItem, hazard)}`
        : 'tile hidden';
      tileEl.textContent = isVisible ? getTileSymbol(tile, isPlayer, lootItem, supportItem, hazard) : '';
      boardEl.appendChild(tileEl);
    }
  }

  updateStats();
}

function loadStage(index, loot = totalLoot, health = 3, message = null) {
  clearNextStageTimeout();
  clearEffectTimeouts();
  currentStageIndex = index;
  state = buildState(index, loot, health);
  isStageTransitioning = false;
  const defaultMessage = state.stageName
    ? `${state.stageName} begins. Riches glitter through the dark.`
    : `Stage ${state.stageNumber} begins. The dungeon grows more dangerous.`;
  setMessage(message ?? defaultMessage);
  render();
}

function restartCurrentStage() {
  loadStage(
    state.stageIndex,
    state.mapStartLoot,
    state.mapStartHealth,
    `You return to the start of stage ${state.stageNumber}.`
  );
}

function loadNextStage(manualAdvance = false) {
  totalLoot = state ? state.loot : totalLoot;
  const carriedHealth = state ? state.health : 3;

  const nextStageIndex = manualAdvance
    ? (currentStageIndex + 1) % STAGE_COUNT
    : currentStageIndex + 1;

  if (nextStageIndex >= STAGE_COUNT) {
    state.won = true;
    state.gameOver = true;
    setMessage(`You conquered all ${STAGE_COUNT} stages and escaped with ${state.loot} loot. The dungeon bows to you.`);
    render();
    return;
  }

  loadStage(
    nextStageIndex,
    totalLoot,
    carriedHealth,
    `Stage ${nextStageIndex + 1} awaits. The dungeon presses harder now.`
  );
}

function celebrateAndAdvance() {
  const completedMoves = state.moves;
  const clearedStage = state.stageNumber;
  state.won = true;

  if (clearedStage >= STAGE_COUNT) {
    setMessage(`Congratulations! You cleared stage ${clearedStage} in ${completedMoves} moves and finished the dungeon with ${state.loot} loot.`);
    state.gameOver = true;
    render();
    return;
  }

  setMessage(`Stage ${clearedStage} cleared in ${completedMoves} moves. Advancing to stage ${clearedStage + 1}...`);
  isStageTransitioning = true;
  render();

  nextStageTimeoutId = setTimeout(() => {
    nextStageTimeoutId = null;
    loadNextStage(false);
  }, 1800);
}

function applyDamage(amount, messagePrefix) {
  if (isShieldActive()) {
    setMessage('Your shield absorbs the danger.');
    return false;
  }

  state.health -= amount;
  if (state.health <= 0) {
    state.health = 0;
    state.gameOver = true;
    setMessage(`You fell on stage ${state.stageNumber}. Press Restart to try again.`);
    return true;
  }

  setMessage(`${messagePrefix} ${state.health} health remaining.`);
  return false;
}

function activateEffect(effectName, startMessage, endMessage) {
  state.effects[effectName] = Date.now() + EFFECT_DURATION_MS;

  if (effectTimeoutIds[effectName] !== null) {
    clearTimeout(effectTimeoutIds[effectName]);
  }

  effectTimeoutIds[effectName] = setTimeout(() => {
    effectTimeoutIds[effectName] = null;
    if (!state) {
      return;
    }

    state.effects[effectName] = 0;
    setMessage(endMessage);
    render();
  }, EFFECT_DURATION_MS);

  setMessage(startMessage);
}

function applyPoisonTick(baseMessage) {
  if (state.poisonTicks <= 0 || state.gameOver) {
    return;
  }

  state.poisonTicks -= 1;
  if (isShieldActive()) {
    setMessage(`${baseMessage} Your shield blocks the poison.`);
    return;
  }

  state.health -= 1;
  if (state.health <= 0) {
    state.health = 0;
    state.gameOver = true;
    setMessage('Poison finishes you off. Press Restart to try again.');
    return;
  }

  setMessage(`${baseMessage} Poison drains 1 health.`);
}

function applyBurnTick(baseMessage) {
  if (state.burnTicks <= 0 || state.gameOver) {
    return;
  }

  state.burnTicks -= 1;
  if (isShieldActive()) {
    setMessage(`${baseMessage} Your shield shrugs off the flames.`);
    return;
  }

  state.health -= 1;
  if (state.health <= 0) {
    state.health = 0;
    state.gameOver = true;
    setMessage('The flames consume you. Press Restart to try again.');
    return;
  }

  setMessage(`${baseMessage} Fire burns you for 1 more damage.`);
}

function collectLootAt(x, y) {
  const item = getLootItemAt(x, y);
  if (!item) {
    return false;
  }

  state.lootItems = state.lootItems.filter(entry => entry !== item);
  state.loot += item.value;
  setMessage(
    item.type === 'gem'
      ? `You found a gemstone worth ${item.value} loot.`
      : `You pocket ${item.value} treasure. Total loot: ${state.loot}.`
  );
  return true;
}

function collectSupportAt(x, y) {
  const item = getSupportItemAt(x, y);
  if (!item) {
    return false;
  }

  state.supportItems = state.supportItems.filter(entry => entry !== item);

  if (item.type === 'meat') {
    state.health = Math.min(state.maxHealth, state.health + 1);
    setMessage(`You eat the meat and recover to ${state.health} health.`);
    return true;
  }

  if (item.type === 'flashlight') {
    activateEffect('flashlight', 'Flashlight on. You can see everything for 10 seconds.', 'The flashlight flickers out.');
    return true;
  }

  if (item.type === 'shield') {
    activateEffect('shield', 'Shield raised. You are invincible for 10 seconds.', 'Your shield fades away.');
    return true;
  }

  return false;
}

function triggerHazardAt(x, y) {
  const hazard = getHazardAt(x, y);
  if (!hazard) {
    return false;
  }

  state.hazards = state.hazards.filter(entry => entry !== hazard);

  switch (hazard.type) {
    case 'trap':
      applyDamage(1, 'A trap strikes you.');
      break;
    case 'spikes':
      applyDamage(1, 'Spikes jab through your boots.');
      break;
    case 'poison':
      if (!applyDamage(1, 'Poison burns through you.') && !isShieldActive()) {
        state.poisonTicks += 2;
        setMessage(`Poison burns through you. ${state.health} health remaining, and the poison lingers.`);
      }
      break;
    case 'arrows':
      applyDamage(1, 'Hidden arrows strike you from the wall.');
      break;
    case 'fire':
      if (!applyDamage(2, 'Fire scorches you for 2 damage.') && !isShieldActive()) {
        state.burnTicks += 3;
        setMessage(`Fire scorches you for 2 damage. ${state.health} health remaining, and the flames keep burning.`);
      }
      break;
    case 'zombie':
      if (isShieldActive()) {
        setMessage('A zombie lurches forward, but your shield holds it back.');
      } else {
        const stolenLoot = Math.min(20, state.loot);
        state.health -= 1;
        state.loot -= stolenLoot;
        if (state.health <= 0) {
          state.health = 0;
          state.gameOver = true;
          setMessage('A zombie drags you down. Press Restart to try again.');
        } else {
          setMessage(`A zombie claws you and steals ${stolenLoot} loot. ${state.health} health remaining.`);
        }
      }
      break;
    default:
      break;
  }

  return true;
}

function movePlayer(dx, dy) {
  if (state.gameOver || state.won) return false;

  const nextX = state.player.x + dx;
  const nextY = state.player.y + dy;
  const nextTile = state.grid[nextY]?.[nextX];
  const wasPoisoned = state.poisonTicks > 0;
  const wasBurning = state.burnTicks > 0;

  if (!nextTile || nextTile === TILE.WALL) {
    setMessage('A cold stone wall blocks your path.');
    return false;
  }

  if (nextTile === TILE.DOOR && state.keys <= 0) {
    setMessage('The door is locked. You need another key.');
    return false;
  }

  state.player.x = nextX;
  state.player.y = nextY;
  state.moves += 1;

  const collectedLoot = collectLootAt(nextX, nextY);
  const collectedSupport = collectSupportAt(nextX, nextY);
  const triggeredHazard = triggerHazardAt(nextX, nextY);

  if (nextTile === TILE.KEY) {
    state.keys += 1;
    state.grid[nextY][nextX] = TILE.FLOOR;
    setMessage(`You picked up a key. ${state.keys} key${state.keys === 1 ? '' : 's'} in hand.`);
  } else if (nextTile === TILE.DOOR) {
    state.keys -= 1;
    state.grid[nextY][nextX] = TILE.FLOOR;
    setMessage(`You unlocked the door. ${state.keys} key${state.keys === 1 ? '' : 's'} remaining.`);
  } else if (nextTile === TILE.EXIT) {
    celebrateAndAdvance();
    return true;
  } else if (!collectedLoot && !collectedSupport && !triggeredHazard) {
    setMessage('You move cautiously through the dungeon.');
  }

  if (wasPoisoned && !state.gameOver && nextTile !== TILE.EXIT) {
    applyPoisonTick(messageEl.textContent);
  }

  if (wasBurning && !state.gameOver && nextTile !== TILE.EXIT) {
    applyBurnTick(messageEl.textContent);
  }

  render();
  return true;
}

function handleDirectionalMove(direction) {
  const moves = {
    up: [0, -1],
    down: [0, 1],
    left: [-1, 0],
    right: [1, 0]
  };

  const selectedMove = moves[direction];
  if (!selectedMove) {
    return;
  }

  const [dx, dy] = selectedMove;
  movePlayer(dx, dy);
}

function handleKeydown(event) {
  if (event.key === 'Escape' && !settingsModal.classList.contains('hidden-modal')) {
    closeSettingsModal();
    return;
  }

  const key = event.key.toLowerCase();
  const moves = {
    arrowup: 'up',
    w: 'up',
    arrowdown: 'down',
    s: 'down',
    arrowleft: 'left',
    a: 'left',
    arrowright: 'right',
    d: 'right'
  };

  if (!moves[key]) return;
  event.preventDefault();
  handleDirectionalMove(moves[key]);
}

restartBtn.addEventListener('click', restartCurrentStage);
newMapBtn.addEventListener('click', () => {
  if (isStageTransitioning) {
    return;
  }

  loadNextStage(true);
});
settingsBtn.addEventListener('click', openSettingsModal);
closeSettingsBtn.addEventListener('click', closeSettingsModal);
modalBackdrop.addEventListener('click', closeSettingsModal);
fogToggle.addEventListener('change', () => {
  settings.fogOfWarEnabled = fogToggle.checked;
  render();
});
touchButtons.forEach(button => {
  button.addEventListener('click', () => {
    handleDirectionalMove(button.dataset.move);
  });
});
compactLayoutQuery.addEventListener('change', event => {
  compactBoardEnabled = event.matches;
  loadStage(
    currentStageIndex,
    state ? state.loot : totalLoot,
    state ? state.health : 3,
    `Screen size changed. Stage ${currentStageIndex + 1} has been resized for this device.`
  );
});
window.addEventListener('keydown', handleKeydown);

loadStage(currentStageIndex, totalLoot, 3);
