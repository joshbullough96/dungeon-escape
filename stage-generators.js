(function () {
  const registry = window.StageGenerationRegistry = window.StageGenerationRegistry || {};
  const generationSchedule = [
    { every: 10, method: 'template-looting' },
    { every: 5, method: 'template' },
    { every: 3, method: 'quadrant' }
  ];

  function getGenerationMethod(stageNumber) {
    for (const rule of generationSchedule) {
      if (stageNumber % rule.every === 0) {
        return rule.method;
      }
    }

    return 'linear';
  }

  window.StageGeneration = {
    getGenerationMethod,
    createStageData(stageNumber, context) {
      const preferredMethod = getGenerationMethod(stageNumber);
      const methodOrder = preferredMethod === 'template-looting'
        ? ['template-looting', 'template', 'quadrant', 'linear']
        : preferredMethod === 'template'
          ? ['template', 'quadrant', 'linear']
          : preferredMethod === 'quadrant'
            ? ['quadrant', 'linear']
            : ['linear'];

      for (const method of methodOrder) {
        if (typeof registry[method] !== 'function') {
          continue;
        }

        const stageData = registry[method](stageNumber, context);
        if (stageData) {
          return {
            ...stageData,
            method
          };
        }
      }

      throw new Error(`No stage generator available for stage ${stageNumber}.`);
    }
  };
})();
