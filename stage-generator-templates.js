(function () {
  const registry = window.StageGenerationRegistry = window.StageGenerationRegistry || {};

  function findTile(rows, tile) {
    for (let y = 0; y < rows.length; y++) {
      for (let x = 0; x < rows[y].length; x++) {
        if (rows[y][x] === tile) {
          return { x, y };
        }
      }
    }

    return null;
  }

  function buildReservedKeys(template, context) {
    const { getPositionKey, addRouteSegment } = context;
    const reserved = new Set();
    const routeKeys = new Set();
    const start = findTile(template.rows, 'P');
    const exit = findTile(template.rows, 'E');

    if (!start || !exit) {
      return template.reservedKeys ? [...template.reservedKeys] : [];
    }

    reserved.add(getPositionKey(start.x, start.y));
    reserved.add(getPositionKey(exit.x, exit.y));
    template.keyPositions.forEach(position => {
      reserved.add(getPositionKey(position.x, position.y));
    });
    template.barrierDoors.forEach(position => {
      reserved.add(getPositionKey(position.x, position.y));
    });

    let routeStart = start;
    for (let index = 0; index < template.keyPositions.length; index++) {
      const keyPosition = template.keyPositions[index];
      addRouteSegment(routeKeys, routeStart, keyPosition);

      if (template.barrierDoors[index]) {
        addRouteSegment(routeKeys, keyPosition, template.barrierDoors[index]);
        routeStart = template.barrierDoors[index];
      } else {
        routeStart = keyPosition;
      }
    }

    addRouteSegment(routeKeys, routeStart, exit);
    routeKeys.forEach(key => reserved.add(key));

    for (let y = Math.max(0, start.y - 1); y <= Math.min(template.rows.length - 1, start.y + 1); y++) {
      for (let x = Math.max(0, start.x - 1); x <= Math.min(template.rows[y].length - 1, start.x + 1); x++) {
        reserved.add(getPositionKey(x, y));
      }
    }

    return [...reserved];
  }

  function cloneTemplate(template, context) {
    return {
      method: 'template',
      rows: [...template.rows],
      reservedKeys: buildReservedKeys(template, context),
      keyPositions: template.keyPositions.map(position => ({ ...position })),
      barrierDoors: template.barrierDoors.map(position => ({ ...position })),
      stageName: template.stageName ?? null,
      templateId: template.id,
      lootProfile: template.lootProfile ? { ...template.lootProfile } : null
    };
  }

  registry.template = function createTemplateStageData(stageNumber, context) {
    const templateSets = window.CustomStageTemplates || {};
    const key = context.compactBoardEnabled ? 'compact' : 'standard';
    const templates = templateSets[key] || [];

    if (templates.length === 0) {
      return null;
    }

    const template = templates[(stageNumber - 1) % templates.length];
    return cloneTemplate(template, context);
  };

  registry['template-looting'] = function createLootingTemplateStageData(stageNumber, context) {
    const templateSets = window.CustomStageTemplates || {};
    const key = context.compactBoardEnabled ? 'compactLooting' : 'standardLooting';
    const templates = templateSets[key] || [];

    if (templates.length === 0) {
      return null;
    }

    const template = templates[(Math.floor(stageNumber / 10) - 1) % templates.length];
    return cloneTemplate(template, context);
  };
})();
