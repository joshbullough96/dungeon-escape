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
const messageEl = document.getElementById('message');
const restartBtn = document.getElementById('restartBtn');
const newMapBtn = document.getElementById('newMapBtn');

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

function cloneTemplate(index) {
  return templates[index].map(row => row.split(''));
}

function buildState(index) {
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

  return {
    grid,
    player,
    moves: 0,
    health: 3,
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
}

function getTileClass(tile, isPlayer) {
  if (isPlayer) return 'player';
  switch (tile) {
    case TILE.WALL: return 'wall';
    case TILE.KEY: return 'key';
    case TILE.DOOR: return 'door';
    case TILE.EXIT: return 'exit';
    case TILE.TRAP: return 'trap';
    default: return 'floor';
  }
}

function getTileSymbol(tile, isPlayer) {
  if (isPlayer) return '\u{1F9D9}';
  switch (tile) {
    case TILE.KEY: return '\u{1F5DD}\uFE0F';
    case TILE.DOOR: return '\u{1F6AA}';
    case TILE.EXIT: return '\u2B06';
    case TILE.TRAP: return '\u26A0';
    default: return '';
  }
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
      const tileEl = document.createElement('div');
      tileEl.className = `tile revealed ${getTileClass(tile, isPlayer)}`;
      tileEl.textContent = getTileSymbol(tile, isPlayer);
      boardEl.appendChild(tileEl);
    }
  }

  updateStats();
}

function restartCurrentMap() {
  clearNextMapTimeout();
  state = buildState(state.templateIndex);
  setMessage('You steady yourself and try again.');
  render();
}

function loadNewMap() {
  clearNextMapTimeout();
  currentTemplateIndex = (currentTemplateIndex + 1) % templates.length;
  state = buildState(currentTemplateIndex);
  setMessage('A different dungeon layout appears from the shadows.');
  render();
}

function celebrateAndAdvance() {
  const completedMoves = state.moves;
  state.won = true;
  setMessage(`Congratulations! You escaped this dungeon in ${completedMoves} moves. Entering the next map...`);
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
  } else {
    setMessage('You move cautiously through the dungeon.');
  }

  render();
}

function handleKeydown(event) {
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
window.addEventListener('keydown', handleKeydown);

state = buildState(currentTemplateIndex);
render();
