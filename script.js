const TILE = {
  WALL: '#',
  FLOOR: '.',
  PLAYER: 'P',
  KEY: 'K',
  DOOR: 'D',
  EXIT: 'E',
  TRAP: 'T'
};

const STAGE_COUNT = 30;

const boardEl = document.getElementById('board');
const stageEl = document.getElementById('stage');
const movesEl = document.getElementById('moves');
const healthEl = document.getElementById('health');
const hasKeyEl = document.getElementById('hasKey');
const lootEl = document.getElementById('loot');
const messageEl = document.getElementById('message');
const restartBtn = document.getElementById('restartBtn');
const newMapBtn = document.getElementById('newMapBtn');
const settingsBtn = document.getElementById('settingsBtn');
const settingsModal = document.getElementById('settingsModal');
const closeSettingsBtn = document.getElementById('closeSettingsBtn');
const modalBackdrop = document.getElementById('modalBackdrop');
const fogToggle = document.getElementById('fogToggle');

let state = null;
let currentStageIndex = 0;
let nextMapTimeoutId = null;
let totalLoot = 0;

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
  const topSlice = candidates.slice(0, Math.max(1, Math.ceil(candidates.length * 0.25)));
  return shuffle(topSlice, rng)[0];
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

function placeTraps(grid, stageNumber, reservedKeys, rng) {
  const available = [];
  const trapCount = Math.min(
    2 + Math.floor((stageNumber - 1) / 3),
    Math.max(2, Math.floor((grid.length - 2) * 0.8))
  );

  for (let y = 1; y < grid.length - 1; y++) {
    for (let x = 1; x < grid[y].length - 1; x++) {
      const key = getPositionKey(x, y);
      if (grid[y][x] === TILE.FLOOR && !reservedKeys.has(key)) {
        available.push({ x, y });
      }
    }
  }

  for (const trap of shuffle(available, rng).slice(0, trapCount)) {
    grid[trap.y][trap.x] = TILE.TRAP;
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

function createStageTemplate(stageNumber) {
  const rng = createSeededRandom(stageNumber * 2654435761);
  const size = 12;
  const wallColumns = [5];
  if (stageNumber >= 11) {
    wallColumns.push(7);
  }
  if (stageNumber >= 21) {
    wallColumns.push(9);
  }
  const grid = createGrid(size);

  for (let y = 1; y < size - 1; y++) {
    for (let x = 1; x < size - 1; x++) {
      grid[y][x] = TILE.FLOOR;
    }
  }

  const barrierDoors = wallColumns.map(column => {
    const doorY = getRandomInt(2, size - 3, rng);

    for (let y = 1; y < size - 1; y++) {
      grid[y][column] = TILE.WALL;
    }

    grid[doorY][column] = TILE.DOOR;
    return { x: column, y: doorY };
  });

  const start = { x: 1, y: 1 };
  const firstDoor = barrierDoors[0];
  const lastDoor = barrierDoors[barrierDoors.length - 1];
  const leftDoorApproach = { x: firstDoor.x - 1, y: firstDoor.y };
  const rightDoorApproach = { x: lastDoor.x + 1, y: lastDoor.y };

  const keyPosition = chooseFarthestPosition(
    grid,
    start,
    (x, y) => x < firstDoor.x && !(x === start.x && y === start.y) && !(x === leftDoorApproach.x && y === leftDoorApproach.y),
    rng
  ) || { x: firstDoor.x - 2, y: size - 2 };

  const exitPosition = chooseFarthestPosition(
    grid,
    rightDoorApproach,
    (x, y) => x > lastDoor.x && !(x === rightDoorApproach.x && y === rightDoorApproach.y),
    rng
  ) || { x: size - 2, y: size - 2 };

  const leftCandidates = [];
  const corridorCandidates = [];
  const rightCandidates = [];

  for (let y = 1; y < size - 1; y++) {
    for (let x = 1; x < size - 1; x++) {
      if (wallColumns.includes(x)) {
        continue;
      }

      if (x < firstDoor.x) {
        leftCandidates.push({ x, y });
      } else if (x > lastDoor.x) {
        rightCandidates.push({ x, y });
      } else {
        corridorCandidates.push({ x, y });
      }
    }
  }

  const leftWallAttempts = Math.max(0, Math.min(leftCandidates.length - 10, 2 + Math.floor(stageNumber / 2)));
  const corridorWallAttempts = Math.max(0, Math.min(corridorCandidates.length - 8, Math.floor(stageNumber / 3)));
  const rightWallAttempts = Math.max(0, Math.min(rightCandidates.length - 10, 3 + Math.floor(stageNumber / 3)));

  const unlockedTargets = [keyPosition, exitPosition];
  for (const door of barrierDoors) {
    unlockedTargets.push({ x: door.x - 1, y: door.y });
    unlockedTargets.push({ x: door.x + 1, y: door.y });
  }

  attemptWallPlacement(
    grid,
    leftCandidates,
    leftWallAttempts,
    [
      { start, targets: [keyPosition, leftDoorApproach], canOpenDoor: false }
    ],
    rng
  );

  attemptWallPlacement(
    grid,
    corridorCandidates,
    corridorWallAttempts,
    [
      { start, targets: [keyPosition, leftDoorApproach], canOpenDoor: false },
      { start, targets: unlockedTargets, canOpenDoor: true }
    ],
    rng
  );

  attemptWallPlacement(
    grid,
    rightCandidates,
    rightWallAttempts,
    [
      { start, targets: unlockedTargets, canOpenDoor: true }
    ],
    rng
  );

  const reservedKeys = new Set([
    getPositionKey(start.x, start.y),
    getPositionKey(keyPosition.x, keyPosition.y),
    getPositionKey(exitPosition.x, exitPosition.y),
    getPositionKey(leftDoorApproach.x, leftDoorApproach.y),
    getPositionKey(rightDoorApproach.x, rightDoorApproach.y)
  ]);

  const routeKeys = new Set();
  addRouteSegment(routeKeys, start, keyPosition);
  addRouteSegment(routeKeys, keyPosition, leftDoorApproach);

  for (const door of barrierDoors) {
    reservedKeys.add(getPositionKey(door.x, door.y));
    reservedKeys.add(getPositionKey(door.x - 1, door.y));
    reservedKeys.add(getPositionKey(door.x + 1, door.y));

    const leftApproach = { x: door.x - 1, y: door.y };
    const rightApproach = { x: door.x + 1, y: door.y };
    addRouteSegment(routeKeys, leftApproach, rightApproach);
  }

  for (let index = 0; index < barrierDoors.length - 1; index++) {
    const currentDoor = barrierDoors[index];
    const nextDoor = barrierDoors[index + 1];
    addRouteSegment(
      routeKeys,
      { x: currentDoor.x + 1, y: currentDoor.y },
      { x: nextDoor.x - 1, y: nextDoor.y }
    );
  }

  addRouteSegment(routeKeys, rightDoorApproach, exitPosition);

  for (const key of routeKeys) {
    reservedKeys.add(key);
    const [x, y] = key.split(',').map(Number);
    if (grid[y]?.[x] && grid[y][x] !== TILE.DOOR) {
      grid[y][x] = TILE.FLOOR;
    }
  }

  for (let y = Math.max(1, start.y - 1); y <= Math.min(size - 2, start.y + 1); y++) {
    for (let x = Math.max(1, start.x - 1); x <= Math.min(size - 2, start.x + 1); x++) {
      reservedKeys.add(getPositionKey(x, y));
    }
  }

  placeTraps(grid, stageNumber, reservedKeys, rng);

  grid[start.y][start.x] = TILE.PLAYER;
  grid[keyPosition.y][keyPosition.x] = TILE.KEY;
  grid[exitPosition.y][exitPosition.x] = TILE.EXIT;

  return grid.map(row => row.join(''));
}

const stageTemplates = Array.from({ length: STAGE_COUNT }, (_, index) => createStageTemplate(index + 1));

function cloneTemplate(index) {
  return stageTemplates[index].map(row => row.split(''));
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

function getFloorPositions(grid, reachableKeys) {
  const positions = [];

  for (let y = 0; y < grid.length; y++) {
    for (let x = 0; x < grid[y].length; x++) {
      if (grid[y][x] !== TILE.FLOOR) {
        continue;
      }

      const key = getPositionKey(x, y);
      if (reachableKeys && !reachableKeys.has(key)) {
        continue;
      }

      positions.push({ x, y });
    }
  }

  return positions;
}

function chooseTreasurePositions(grid, player, stageNumber) {
  const reachableWithoutDoor = getReachableData(grid, player, false).visited;
  const reachableWithDoor = getReachableData(grid, player, true).visited;
  const reachableFloors = getFloorPositions(grid, reachableWithDoor);
  const exitPosition = findTilePosition(grid, TILE.EXIT);
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
    const farCount = Math.max(1, Math.ceil(sortedByDistance.length * 0.35));
    farFromExitFloors = sortedByDistance.slice(0, farCount);
  }

  const desiredCount = Math.min(reachableFloors.length, 2 + Math.floor((stageNumber - 1) / 10));
  const chosenKeys = new Set();
  const chosenPositions = [];

  function takeRandomPosition(pool) {
    const candidate = shuffle(pool).find(position => !chosenKeys.has(getPositionKey(position.x, position.y)));
    if (!candidate) {
      return;
    }

    chosenKeys.add(getPositionKey(candidate.x, candidate.y));
    chosenPositions.push(candidate);
  }

  if (lockedAreaFloors.length > 0 && Math.random() < 0.7) {
    takeRandomPosition(lockedAreaFloors);
  }

  if (farFromExitFloors.length > 0 && chosenPositions.length < desiredCount) {
    takeRandomPosition(farFromExitFloors);
  }

  while (chosenPositions.length < desiredCount) {
    const beforeCount = chosenPositions.length;
    takeRandomPosition(reachableFloors);
    if (chosenPositions.length === beforeCount) {
      break;
    }
  }

  return chosenPositions.map(position => ({
    x: position.x,
    y: position.y,
    value: getRandomInt(15, 35 + Math.floor(stageNumber / 2))
  }));
}

function getTreasureAt(x, y) {
  return state.treasures.find(treasure => treasure.x === x && treasure.y === y) ?? null;
}

function buildState(index, loot = totalLoot) {
  const grid = cloneTemplate(index);
  const stageNumber = index + 1;
  let player = { x: 0, y: 0 };

  for (let y = 0; y < grid.length; y++) {
    for (let x = 0; x < grid[y].length; x++) {
      if (grid[y][x] === TILE.PLAYER) {
        player = { x, y };
        grid[y][x] = TILE.FLOOR;
      }
    }
  }

  return {
    grid,
    player,
    stageIndex: index,
    stageNumber,
    moves: 0,
    health: 3,
    loot,
    mapStartLoot: loot,
    treasures: chooseTreasurePositions(grid, player, stageNumber),
    hasKey: false,
    gameOver: false,
    won: false
  };
}

function setMessage(text) {
  messageEl.textContent = text;
}

function clearNextMapTimeout() {
  if (nextMapTimeoutId !== null) {
    clearTimeout(nextMapTimeoutId);
    nextMapTimeoutId = null;
  }
}

function updateStats() {
  stageEl.textContent = state.stageNumber;
  movesEl.textContent = state.moves;
  healthEl.textContent = state.health;
  hasKeyEl.textContent = state.hasKey ? 'Yes' : 'No';
  lootEl.textContent = state.loot;
}

function getTileClass(tile, isPlayer, treasure) {
  if (isPlayer) return 'player';
  if (treasure) return 'treasure';
  switch (tile) {
    case TILE.WALL: return 'wall';
    case TILE.KEY: return 'key';
    case TILE.DOOR: return 'door';
    case TILE.EXIT: return 'exit';
    case TILE.TRAP: return 'trap';
    default: return 'floor';
  }
}

function getTileSymbol(tile, isPlayer, treasure) {
  if (isPlayer) return '\u{1F9D9}';
  if (treasure) return '\u{1F4B0}';
  switch (tile) {
    case TILE.KEY: return '\u{1F5DD}\uFE0F';
    case TILE.DOOR: return '\u{1F6AA}';
    case TILE.EXIT: return '\u2B06';
    case TILE.TRAP: return '\u26A0';
    default: return '';
  }
}

function isTileVisible(x, y) {
  if (!settings.fogOfWarEnabled) {
    return true;
  }

  return Math.abs(state.player.x - x) <= 1 && Math.abs(state.player.y - y) <= 1;
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
      const treasure = getTreasureAt(x, y);
      const isVisible = isTileVisible(x, y);
      const tileEl = document.createElement('div');
      tileEl.className = isVisible
        ? `tile revealed ${getTileClass(tile, isPlayer, treasure)}`
        : 'tile hidden';
      tileEl.textContent = isVisible ? getTileSymbol(tile, isPlayer, treasure) : '';
      boardEl.appendChild(tileEl);
    }
  }

  updateStats();
}

function loadStage(index, loot = totalLoot, message = null) {
  clearNextMapTimeout();
  currentStageIndex = index;
  state = buildState(index, loot);
  setMessage(message ?? `Stage ${state.stageNumber} begins. The dungeon grows more dangerous.`);
  render();
}

function restartCurrentStage() {
  loadStage(state.stageIndex, state.mapStartLoot, `You return to the start of stage ${state.stageNumber}.`);
}

function loadNextStage(manualAdvance = false) {
  totalLoot = state ? state.loot : totalLoot;

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

  loadStage(nextStageIndex, totalLoot, `Stage ${nextStageIndex + 1} awaits. The dungeon presses harder now.`);
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
  render();

  nextMapTimeoutId = setTimeout(() => {
    nextMapTimeoutId = null;
    loadNextStage(false);
  }, 1800);
}

function damagePlayer() {
  state.health -= 1;
  if (state.health <= 0) {
    state.gameOver = true;
    setMessage(`You fell on stage ${state.stageNumber}. Press Restart to try again.`);
  } else {
    setMessage(`A trap strikes you. ${state.health} health remaining.`);
  }
}

function collectTreasureAt(x, y) {
  const treasure = getTreasureAt(x, y);

  if (!treasure) {
    return false;
  }

  state.treasures = state.treasures.filter(item => item !== treasure);
  state.loot += treasure.value;
  setMessage(`You pocket ${treasure.value} treasure. Total loot: ${state.loot}.`);
  return true;
}

function movePlayer(dx, dy) {
  if (state.gameOver || state.won) return;

  const nextX = state.player.x + dx;
  const nextY = state.player.y + dy;
  const nextTile = state.grid[nextY]?.[nextX];

  if (!nextTile || nextTile === TILE.WALL) {
    setMessage('A cold stone wall blocks your path.');
    return;
  }

  if (nextTile === TILE.DOOR && !state.hasKey) {
    setMessage('The door is locked. You need the key first.');
    return;
  }

  state.player.x = nextX;
  state.player.y = nextY;
  state.moves += 1;
  const collectedTreasure = collectTreasureAt(nextX, nextY);

  if (nextTile === TILE.KEY) {
    state.hasKey = true;
    state.grid[nextY][nextX] = TILE.FLOOR;
    setMessage('You picked up the key. Now find the door and escape.');
  } else if (nextTile === TILE.DOOR) {
    state.grid[nextY][nextX] = TILE.FLOOR;
    setMessage('You unlocked the dungeon door. The exit is near.');
  } else if (nextTile === TILE.TRAP) {
    state.grid[nextY][nextX] = TILE.FLOOR;
    damagePlayer();
  } else if (nextTile === TILE.EXIT) {
    celebrateAndAdvance();
    return;
  } else if (!collectedTreasure) {
    setMessage('You move cautiously through the dungeon.');
  }

  render();
}

function handleKeydown(event) {
  if (event.key === 'Escape' && !settingsModal.classList.contains('hidden-modal')) {
    closeSettingsModal();
    return;
  }

  const key = event.key.toLowerCase();
  const moves = {
    arrowup: [0, -1],
    w: [0, -1],
    arrowdown: [0, 1],
    s: [0, 1],
    arrowleft: [-1, 0],
    a: [-1, 0],
    arrowright: [1, 0],
    d: [1, 0]
  };

  if (!moves[key]) return;
  event.preventDefault();
  const [dx, dy] = moves[key];
  movePlayer(dx, dy);
}

restartBtn.addEventListener('click', restartCurrentStage);
newMapBtn.addEventListener('click', () => loadNextStage(true));
settingsBtn.addEventListener('click', openSettingsModal);
closeSettingsBtn.addEventListener('click', closeSettingsModal);
modalBackdrop.addEventListener('click', closeSettingsModal);
fogToggle.addEventListener('change', () => {
  settings.fogOfWarEnabled = fogToggle.checked;
  render();
});
window.addEventListener('keydown', handleKeydown);

loadStage(currentStageIndex);
