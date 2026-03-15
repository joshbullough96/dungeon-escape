(function () {
  const registry = window.StageGenerationRegistry = window.StageGenerationRegistry || {};

  function getQuadrantProfile() {
    return { size: 12, maxDoors: 3, obstacleAttempts: 5 };
  }

  function getRoomBounds(size, roomName) {
    const midX = Math.floor(size / 2);
    const midY = Math.floor(size / 2);

    switch (roomName) {
      case 'topLeft':
        return { minX: 1, maxX: midX - 1, minY: 1, maxY: midY - 1 };
      case 'topRight':
        return { minX: midX + 1, maxX: size - 2, minY: 1, maxY: midY - 1 };
      case 'bottomRight':
        return { minX: midX + 1, maxX: size - 2, minY: midY + 1, maxY: size - 2 };
      default:
        return { minX: 1, maxX: midX - 1, minY: midY + 1, maxY: size - 2 };
    }
  }

  function getRoomCandidates(bounds) {
    const candidates = [];

    for (let y = bounds.minY; y <= bounds.maxY; y++) {
      for (let x = bounds.minX; x <= bounds.maxX; x++) {
        candidates.push({ x, y });
      }
    }

    return candidates;
  }

  registry.quadrant = function createQuadrantStageData(stageNumber, context) {
    const {
      createSeededRandom,
      getRandomInt,
      chooseFarthestPosition,
      createGrid,
      attemptWallPlacement,
      addRouteSegment,
      getPositionKey,
      TILE,
      canReachAll,
      canReachAllWithProgression
    } = context;
    const rng = createSeededRandom(stageNumber * 1597334677);
    const profile = getQuadrantProfile();
    const size = profile.size;
    const grid = createGrid(size);
    const midX = Math.floor(size / 2);
    const midY = Math.floor(size / 2);

    for (let y = 1; y < size - 1; y++) {
      for (let x = 1; x < size - 1; x++) {
        grid[y][x] = TILE.FLOOR;
      }
    }

    for (let y = 1; y < size - 1; y++) {
      grid[y][midX] = TILE.WALL;
    }

    for (let x = 1; x < size - 1; x++) {
      grid[midY][x] = TILE.WALL;
    }

    const connectors = {
      topLeftToTopRight: {
        x: midX,
        y: getRandomInt(2, midY - 1, rng),
        preDoor: position => ({ x: position.x - 1, y: position.y }),
        postDoor: position => ({ x: position.x + 1, y: position.y })
      },
      topRightToBottomRight: {
        x: getRandomInt(midX + 1, size - 3, rng),
        y: midY,
        preDoor: position => ({ x: position.x, y: position.y - 1 }),
        postDoor: position => ({ x: position.x, y: position.y + 1 })
      },
      bottomRightToBottomLeft: {
        x: midX,
        y: getRandomInt(midY + 1, size - 3, rng),
        preDoor: position => ({ x: position.x + 1, y: position.y }),
        postDoor: position => ({ x: position.x - 1, y: position.y })
      },
      bottomLeftToTopLeft: {
        x: getRandomInt(2, midX - 1, rng),
        y: midY,
        preDoor: position => ({ x: position.x, y: position.y + 1 }),
        postDoor: position => ({ x: position.x, y: position.y - 1 })
      }
    };

    const lockedDoorCount = Math.min(
      stageNumber >= 21 ? 3 : stageNumber >= 11 ? 2 : 1,
      profile.maxDoors
    );
    const start = { x: 1, y: 1 };
    const pathRooms = lockedDoorCount >= 3
      ? ['topLeft', 'topRight', 'bottomRight', 'bottomLeft']
      : ['topLeft', 'topRight', 'bottomRight'];
    const pathConnectors = lockedDoorCount >= 3
      ? [connectors.topLeftToTopRight, connectors.topRightToBottomRight, connectors.bottomRightToBottomLeft]
      : lockedDoorCount === 2
        ? [connectors.topLeftToTopRight, connectors.topRightToBottomRight]
        : [connectors.topLeftToTopRight];

    grid[connectors.bottomLeftToTopLeft.y][connectors.bottomLeftToTopLeft.x] = TILE.FLOOR;
    if (lockedDoorCount < 2) {
      grid[connectors.topRightToBottomRight.y][connectors.topRightToBottomRight.x] = TILE.FLOOR;
    }
    if (lockedDoorCount < 3) {
      grid[connectors.bottomRightToBottomLeft.y][connectors.bottomRightToBottomLeft.x] = TILE.FLOOR;
    }

    const keyPositions = [];
    const barrierDoors = [];
    let routeStart = start;

    for (let index = 0; index < lockedDoorCount; index++) {
      const roomBounds = getRoomBounds(size, pathRooms[index]);
      const door = pathConnectors[index];
      const keyPosition = chooseFarthestPosition(
        grid,
        routeStart,
        (x, y) => {
          return x >= roomBounds.minX &&
            x <= roomBounds.maxX &&
            y >= roomBounds.minY &&
            y <= roomBounds.maxY &&
            !(x === routeStart.x && y === routeStart.y);
        },
        rng
      ) || getRoomCandidates(roomBounds).slice(-1)[0];

      keyPositions.push({ x: keyPosition.x, y: keyPosition.y });
      barrierDoors.push({ x: door.x, y: door.y });
      grid[door.y][door.x] = TILE.DOOR;
      routeStart = door.postDoor(door);
    }

    const finalRoomBounds = getRoomBounds(size, pathRooms[pathRooms.length - 1]);
    const exitEntry = lockedDoorCount === 3
      ? { x: midX - 1, y: connectors.bottomRightToBottomLeft.y }
      : lockedDoorCount === 2
        ? { x: connectors.topRightToBottomRight.x, y: midY + 1 }
        : { x: connectors.topLeftToTopRight.x + 1, y: connectors.topLeftToTopRight.y };
    const exitPosition = chooseFarthestPosition(
      grid,
      exitEntry,
      (x, y) => {
        return x >= finalRoomBounds.minX &&
          x <= finalRoomBounds.maxX &&
          y >= finalRoomBounds.minY &&
          y <= finalRoomBounds.maxY &&
          (y === finalRoomBounds.minY || y === finalRoomBounds.maxY || x === finalRoomBounds.maxX);
      },
      rng
    ) || { x: finalRoomBounds.maxX, y: finalRoomBounds.maxY };

    const reservedKeys = new Set([
      getPositionKey(start.x, start.y),
      getPositionKey(exitPosition.x, exitPosition.y),
      getPositionKey(exitEntry.x, exitEntry.y)
    ]);
    const routeKeys = new Set();
    let routeCursor = start;

    for (let index = 0; index < barrierDoors.length; index++) {
      const keyPosition = keyPositions[index];
      const door = pathConnectors[index];
      const preDoor = door.preDoor(door);
      const postDoor = door.postDoor(door);

      addRouteSegment(routeKeys, routeCursor, keyPosition);
      addRouteSegment(routeKeys, keyPosition, preDoor);
      addRouteSegment(routeKeys, preDoor, postDoor);
      reservedKeys.add(getPositionKey(door.x, door.y));
      reservedKeys.add(getPositionKey(preDoor.x, preDoor.y));
      reservedKeys.add(getPositionKey(postDoor.x, postDoor.y));
      routeCursor = postDoor;
    }

    addRouteSegment(routeKeys, routeCursor, exitPosition);

    for (const position of keyPositions) {
      reservedKeys.add(getPositionKey(position.x, position.y));
    }

    for (const key of routeKeys) {
      reservedKeys.add(key);
    }

    const obstacleCandidates = [];
    for (const roomName of ['topLeft', 'topRight', 'bottomRight', 'bottomLeft']) {
      for (const candidate of getRoomCandidates(getRoomBounds(size, roomName))) {
        const key = getPositionKey(candidate.x, candidate.y);
        if (!reservedKeys.has(key)) {
          obstacleCandidates.push(candidate);
        }
      }
    }

    const unlockedTargets = [...keyPositions, exitPosition];
    for (const door of pathConnectors.slice(0, barrierDoors.length)) {
      unlockedTargets.push(
        door.preDoor(door),
        door.postDoor(door)
      );
    }

    const gridBeforeObstacles = grid.map(row => [...row]);

    attemptWallPlacement(
      grid,
      obstacleCandidates,
      Math.min(profile.obstacleAttempts + Math.floor(stageNumber / 8), Math.max(0, obstacleCandidates.length - 10)),
      [
        {
          start,
          targets: unlockedTargets,
          validation: 'progression',
          keyPositions,
          doorPositions: barrierDoors
        },
        { start, targets: [keyPositions[0]], canOpenDoor: false }
      ],
      rng
    );

    if (
      !canReachAll(grid, start, [keyPositions[0]], false) ||
      !canReachAllWithProgression(grid, start, keyPositions, barrierDoors, unlockedTargets)
    ) {
      for (let rowIndex = 0; rowIndex < grid.length; rowIndex++) {
        grid[rowIndex] = [...gridBeforeObstacles[rowIndex]];
      }
    }

    grid[start.y][start.x] = TILE.PLAYER;
    keyPositions.forEach(position => {
      grid[position.y][position.x] = TILE.KEY;
    });
    grid[exitPosition.y][exitPosition.x] = TILE.EXIT;

    return {
      method: 'quadrant',
      rows: grid.map(row => row.join('')),
      reservedKeys: [...reservedKeys],
      keyPositions,
      barrierDoors
    };
  };
})();
