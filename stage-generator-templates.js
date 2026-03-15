(function () {
  const registry = window.StageGenerationRegistry = window.StageGenerationRegistry || {};

  function cloneTemplate(template) {
    return {
      method: 'template',
      rows: [...template.rows],
      reservedKeys: [...template.reservedKeys],
      keyPositions: template.keyPositions.map(position => ({ ...position })),
      barrierDoors: template.barrierDoors.map(position => ({ ...position })),
      templateId: template.id
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
    return cloneTemplate(template);
  };

  registry['template-looting'] = function createLootingTemplateStageData(stageNumber, context) {
    const templateSets = window.CustomStageTemplates || {};
    const key = context.compactBoardEnabled ? 'compactLooting' : 'standardLooting';
    const templates = templateSets[key] || [];

    if (templates.length === 0) {
      return null;
    }

    const template = templates[(Math.floor(stageNumber / 10) - 1) % templates.length];
    return cloneTemplate(template);
  };
})();
