const TILE = {
  WALL: '#',
  FLOOR: '.',
  PLAYER: 'P',
  KEY: 'K',
  DOOR: 'D',
  EXIT: 'E',
  TRAP: 'T'
};

const boardEl = document.getElementById('board');
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

const templates = [
  [
    '############',
    '#P....#....#',
    '#.##..#.##.#',
    '#..T..#..K.#',
    '####.##.##.#',
    '#....#.....#',
    '#.##.#.###.#',
    '#....#...#.#',
    '#.######.#.#',
    '#......#.#D#',
    '#.T##....#E#',
    '############'
  ],
  [
    '############',
    '#P..#.....E#',
    '#.#.#.###.##',
    '#.#...#...##',
    '#.###.#.#.##',
    '#...#.#.#..#',
    '###.#.#.##.#',
    '#...#.#....#',
    '#.###.####.#',
    '#..K..T..D.#',
    '#....T.....#',
    '############'
  ],
  [
    '############',
    '#P.....#...#',
    '#####..#.###',
    '#...#..#...#',
    '#.T.#.###K.#',
    '#...#.....##',
    '#.#####.#..#',
    '#.....#.#.##',
    '###.#.#.#..#',
    '#...#...#D.#',
    '#.T.#####.E#',
    '############'
  ]
];

let state = null;
let currentTemplateIndex = 0;
let nextMapTimeoutId = null;
let totalLoot = 0;
const settings = {
  fogOfWarEnabled: true
};

function cloneTemplate(index) {
  return templates[index].map(row => row.split(''));
}

function getPositionKey(x, y) {
  return `${x},${y}`;
}

function getRandomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function shuffle(items) {
  const copy = [...items];

  for (let index = copy.length - 1; index > 0; index--) {
    const swapIndex = getRandomInt(0, index);
    [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
  }

  return copy;
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

function chooseTreasurePositions(grid, player) {
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

  const desiredCount = Math.min(reachableFloors.length, getRandomInt(2, 3));
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

  if (lockedAreaFloors.length > 0 && Math.random() < 0.65) {
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
    value: getRandomInt(15, 35)
  }));
}

function getTreasureAt(x, y) {
  return state.treasures.find(treasure => treasure.x === x && treasure.y === y) ?? null;
}

function buildState(index, loot = totalLoot) {
  const grid = cloneTemplate(index);
  let player = { x: 0, y: 0 };

  for (let y = 0; y < grid.length; y++) {
    for (let x = 0; x < grid[y].length; x++) {
      if (grid[y][x] === TILE.PLAYER) {
        player = { x, y };
        grid[y][x] = TILE.FLOOR;
      }
    }
  }

  const treasures = chooseTreasurePositions(grid, player);

  return {
    grid,
    player,
    moves: 0,
    health: 3,
    loot,
    mapStartLoot: loot,
    treasures,
    hasKey: false,
    gameOver: false,
    won: false,
    templateIndex: index
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

function restartCurrentMap() {
  clearNextMapTimeout();
  state = buildState(state.templateIndex, state.mapStartLoot);
  setMessage('You steady yourself and try again.');
  render();
}

function loadNewMap() {
  clearNextMapTimeout();
  totalLoot = state ? state.loot : totalLoot;
  currentTemplateIndex = (currentTemplateIndex + 1) % templates.length;
  state = buildState(currentTemplateIndex, totalLoot);
  setMessage('A different dungeon layout appears from the shadows.');
  render();
}

function celebrateAndAdvance() {
  const completedMoves = state.moves;
  state.won = true;
  setMessage(`Congratulations! You escaped this dungeon in ${completedMoves} moves with ${state.loot} loot. Entering the next map...`);
  render();

  nextMapTimeoutId = setTimeout(() => {
    nextMapTimeoutId = null;
    loadNewMap();
  }, 1800);
}

function damagePlayer() {
  state.health -= 1;
  if (state.health <= 0) {
    state.gameOver = true;
    setMessage('You fell to the dungeon traps. Press Restart to try again.');
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

restartBtn.addEventListener('click', restartCurrentMap);
newMapBtn.addEventListener('click', loadNewMap);
settingsBtn.addEventListener('click', openSettingsModal);
closeSettingsBtn.addEventListener('click', closeSettingsModal);
modalBackdrop.addEventListener('click', closeSettingsModal);
fogToggle.addEventListener('change', () => {
  settings.fogOfWarEnabled = fogToggle.checked;
  render();
});
window.addEventListener('keydown', handleKeydown);

state = buildState(currentTemplateIndex);
render();
