(function () {
  const registry = window.StageGenerationRegistry = window.StageGenerationRegistry || {};

  function getBoardProfile(stageNumber) {
    return {
      size: 12,
      wallColumns: stageNumber >= 21 ? [5, 7, 9] : stageNumber >= 11 ? [5, 7] : [5]
    };
  }

  function createKeyDistribution(segmentCandidates, rng) {
    const counts = Array(segmentCandidates.length).fill(1);

    for (let donor = segmentCandidates.length - 1; donor > 0; donor--) {
      if (counts[donor] <= 0) {
        continue;
      }

      const recipients = [];
      for (let recipient = 0; recipient < donor; recipient++) {
        if (counts[recipient] < segmentCandidates[recipient].length) {
          recipients.push(recipient);
        }
      }

      if (recipients.length === 0 || rng() < 0.45) {
        continue;
      }

      const recipientIndex = recipients[Math.floor(rng() * recipients.length)];
      counts[donor] -= 1;
      counts[recipientIndex] += 1;
    }

    return counts;
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
      TILE
    } = context;
    const rng = createSeededRandom(stageNumber * 2654435761);
    const profile = getBoardProfile(stageNumber);
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
    const segmentCandidates = barrierDoors.map((door, index) => {
      const previousDoor = barrierDoors[index - 1] ?? null;
      const candidates = [];

      for (let y = 1; y < size - 1; y++) {
        for (let x = 1; x < size - 1; x++) {
          if (previousDoor) {
            if (x > previousDoor.x && x < door.x) {
              candidates.push({ x, y });
            }
            continue;
          }

          if (x < door.x && !(x === start.x && y === start.y) && !(x === leftDoorApproach.x && y === leftDoorApproach.y)) {
            candidates.push({ x, y });
          }
        }
      }

      return candidates;
    });
    const keyDistribution = createKeyDistribution(segmentCandidates, rng);
    const keyGroups = segmentCandidates.map((segment, index) => {
      const previousDoor = barrierDoors[index - 1] ?? null;
      const segmentStart = previousDoor
        ? { x: previousDoor.x + 1, y: previousDoor.y }
        : start;
      const used = new Set();
      const positions = [];

      for (let count = 0; count < keyDistribution[index]; count++) {
        const candidate = chooseFarthestPosition(
          grid,
          segmentStart,
          (x, y) => {
            const key = `${x},${y}`;
            return segment.some(position => position.x === x && position.y === y) && !used.has(key);
          },
          rng
        ) || segment.find(position => !used.has(`${position.x},${position.y}`));

        if (!candidate) {
          continue;
        }

        used.add(`${candidate.x},${candidate.y}`);
        positions.push(candidate);
      }

      return positions;
    });
    const keyPositions = keyGroups.flat();

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
        { start, targets: [...keyGroups[0], leftDoorApproach], canOpenDoor: false }
      ],
      rng
    );

    attemptWallPlacement(
      grid,
      corridorCandidates,
      corridorWallAttempts,
      [
        { start, targets: [...keyGroups[0], leftDoorApproach], canOpenDoor: false },
        {
          start,
          targets: unlockedTargets,
          validation: 'progression',
          keyPositions,
          doorPositions: barrierDoors
        }
      ],
      rng
    );

    attemptWallPlacement(
      grid,
      rightCandidates,
      rightWallAttempts,
      [
        {
          start,
          targets: unlockedTargets,
          validation: 'progression',
          keyPositions,
          doorPositions: barrierDoors
        }
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
      const segmentKeys = keyGroups[index];

      for (const keyPosition of segmentKeys) {
        addRouteSegment(routeKeys, routeStart, keyPosition);
        routeStart = keyPosition;
      }

      addRouteSegment(routeKeys, routeStart, { x: door.x - 1, y: door.y });
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
