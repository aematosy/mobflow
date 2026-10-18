export interface ContextMenuPosition {
  left: number;
  top: number;
}

export function calculateContextMenuPosition(
  anchorX: number,
  anchorY: number,
  menuWidth: number,
  menuHeight: number,
  viewportWidth: number,
  viewportHeight: number,
  margin = 12,
): ContextMenuPosition {
  const maxLeft = Math.max(
    margin,
    viewportWidth - menuWidth - margin,
  );

  const maxTop = Math.max(
    margin,
    viewportHeight - menuHeight - margin,
  );

  const preferredLeft =
    anchorX + menuWidth + margin <= viewportWidth
      ? anchorX
      : anchorX - menuWidth;

  const preferredTop =
    anchorY + menuHeight + margin <= viewportHeight
      ? anchorY
      : anchorY - menuHeight;

  return {
    left: Math.min(
      Math.max(preferredLeft, margin),
      maxLeft,
    ),
    top: Math.min(
      Math.max(preferredTop, margin),
      maxTop,
    ),
  };
}
