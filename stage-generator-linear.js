(function () {
  const registry = window.StageGenerationRegistry = window.StageGenerationRegistry || {};

  function getBoardProfile(stageNumber, compactBoardEnabled) {
    if (compactBoardEnabled) {
      return {
        size: 9,
        wallColumns: stageNumber >= 11 ? [3, 5] : [4]
      };
    }

    return {
      size: 12,
      wallColumns: stageNumber >= 21 ? [5, 7, 9] : stageNumber >= 11 ? [5, 7] : [5]
    };
  }

  registry.linear = function createLinearStageData(stageNumber, context) {
    const {
      createSeededRandom,
      getRandomInt,
      chooseFarthestPosition,
      createGrid,
      attemptWallPlacement,
      addRouteSegment,
      getPositionKey,
      TILE,
      compactBoardEnabled
    } = context;
    const rng = createSeededRandom(stageNumber * 2654435761);
    const profile = getBoardProfile(stageNumber, compactBoardEnabled);
    const size = profile.size;
    const wallColumns = [...profile.wallColumns];
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

    const keyPositions = barrierDoors.map((door, index) => {
      const previousDoor = barrierDoors[index - 1] ?? null;
      const segmentStart = previousDoor
        ? { x: previousDoor.x + 1, y: previousDoor.y }
        : start;

      const candidate = chooseFarthestPosition(
        grid,
        segmentStart,
        (x, y) => {
          if (previousDoor) {
            return x > previousDoor.x && x < door.x && !(x === segmentStart.x && y === segmentStart.y);
          }

          return x < door.x && !(x === start.x && y === start.y) && !(x === leftDoorApproach.x && y === leftDoorApproach.y);
        },
        rng
      );

      if (candidate) {
        return candidate;
      }

      return previousDoor
        ? { x: previousDoor.x + 1, y: Math.min(size - 2, previousDoor.y + 1) }
        : { x: firstDoor.x - 2, y: size - 2 };
    });

    const exitPosition = chooseFarthestPosition(
      grid,
      rightDoorApproach,
      (x, y) => {
        return x > lastDoor.x &&
          (y === 1 || y === size - 2) &&
          !(x === rightDoorApproach.x && y === rightDoorApproach.y);
      },
      rng
    ) || chooseFarthestPosition(
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

    const unlockedTargets = [...keyPositions, exitPosition];
    for (const door of barrierDoors) {
      unlockedTargets.push({ x: door.x - 1, y: door.y });
      unlockedTargets.push({ x: door.x + 1, y: door.y });
    }

    attemptWallPlacement(
      grid,
      leftCandidates,
      leftWallAttempts,
      [
        { start, targets: [keyPositions[0], leftDoorApproach], canOpenDoor: false }
      ],
      rng
    );

    attemptWallPlacement(
      grid,
      corridorCandidates,
      corridorWallAttempts,
      [
        { start, targets: [keyPositions[0], leftDoorApproach], canOpenDoor: false },
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
      getPositionKey(exitPosition.x, exitPosition.y),
      getPositionKey(leftDoorApproach.x, leftDoorApproach.y),
      getPositionKey(rightDoorApproach.x, rightDoorApproach.y)
    ]);
    keyPositions.forEach(position => {
      reservedKeys.add(getPositionKey(position.x, position.y));
    });

    const routeKeys = new Set();
    let routeStart = start;

    for (let index = 0; index < barrierDoors.length; index++) {
      const door = barrierDoors[index];
      const keyPosition = keyPositions[index];

      addRouteSegment(routeKeys, routeStart, keyPosition);
      addRouteSegment(routeKeys, keyPosition, { x: door.x - 1, y: door.y });
      reservedKeys.add(getPositionKey(door.x, door.y));
      reservedKeys.add(getPositionKey(door.x - 1, door.y));
      reservedKeys.add(getPositionKey(door.x + 1, door.y));

      addRouteSegment(routeKeys, { x: door.x - 1, y: door.y }, { x: door.x + 1, y: door.y });
      routeStart = { x: door.x + 1, y: door.y };
    }

    addRouteSegment(routeKeys, routeStart, exitPosition);

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

    grid[start.y][start.x] = TILE.PLAYER;
    keyPositions.forEach(position => {
      grid[position.y][position.x] = TILE.KEY;
    });
    grid[exitPosition.y][exitPosition.x] = TILE.EXIT;

    return {
      method: 'linear',
      rows: grid.map(row => row.join('')),
      reservedKeys: [...reservedKeys],
      keyPositions,
      barrierDoors
    };
  };
})();
