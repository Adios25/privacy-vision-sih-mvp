(() => {
  function finitePositive(value, fallback = 1) {
    const number = Number(value);
    return Number.isFinite(number) && number > 0 ? number : fallback;
  }

  function clampRect(rect, bounds) {
    const maxWidth = finitePositive(bounds?.width);
    const maxHeight = finitePositive(bounds?.height);
    const x = Number(rect?.x || 0);
    const y = Number(rect?.y || 0);
    const width = Math.max(0, Number(rect?.width || 0));
    const height = Math.max(0, Number(rect?.height || 0));
    const left = Math.max(0, Math.min(maxWidth, x));
    const top = Math.max(0, Math.min(maxHeight, y));
    const right = Math.max(left, Math.min(maxWidth, x + width));
    const bottom = Math.max(top, Math.min(maxHeight, y + height));
    return { x: left, y: top, width: right - left, height: bottom - top };
  }

  function screenshotRectToViewport(rect, imageSize, viewport) {
    const imageWidth = finitePositive(imageSize?.width);
    const imageHeight = finitePositive(imageSize?.height);
    const viewportWidth = finitePositive(viewport?.width, imageWidth);
    const viewportHeight = finitePositive(viewport?.height, imageHeight);
    return clampRect({
      x: Number(rect?.x || 0) * viewportWidth / imageWidth,
      y: Number(rect?.y || 0) * viewportHeight / imageHeight,
      width: Number(rect?.width || 0) * viewportWidth / imageWidth,
      height: Number(rect?.height || 0) * viewportHeight / imageHeight
    }, { width: viewportWidth, height: viewportHeight });
  }

  function viewportRectToPreview(rect, imageSize, viewport, ratio = 1) {
    const imageWidth = finitePositive(imageSize?.width);
    const imageHeight = finitePositive(imageSize?.height);
    const viewportWidth = finitePositive(viewport?.width, imageWidth);
    const viewportHeight = finitePositive(viewport?.height, imageHeight);
    const previewWidth = imageWidth * ratio;
    const previewHeight = imageHeight * ratio;
    return clampRect({
      x: Number(rect?.x || 0) * imageWidth / viewportWidth * ratio,
      y: Number(rect?.y || 0) * imageHeight / viewportHeight * ratio,
      width: Number(rect?.width || 0) * imageWidth / viewportWidth * ratio,
      height: Number(rect?.height || 0) * imageHeight / viewportHeight * ratio
    }, { width: previewWidth, height: previewHeight });
  }

  globalThis.PrivvyGeometry = { clampRect, screenshotRectToViewport, viewportRectToPreview };
})();
