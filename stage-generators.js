(function () {
  const registry = window.StageGenerationRegistry = window.StageGenerationRegistry || {};

  function getGenerationMethod(stageNumber) {
    if (stageNumber % 10 === 0) {
      return 'template-looting';
    }

    if (stageNumber % 5 === 0) {
      return 'template';
    }

    if (stageNumber % 3 === 0) {
      return 'quadrant';
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
