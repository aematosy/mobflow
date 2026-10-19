import type {
  ElementBounds,
  InspectorElement,
} from "../../types/mobile";

export type InspectorMode =
  | "inspect"
  | "interact";

export interface Point {
  x: number;
  y: number;
}

export function calculateFitZoom(
  viewportWidth: number,
  viewportHeight: number,
  screenWidth: number,
  screenHeight: number,
  padding = 40,
): number {
  if (
    viewportWidth <= 0 ||
    viewportHeight <= 0 ||
    screenWidth <= 0 ||
    screenHeight <= 0
  ) {
    return 25;
  }

  const usableWidth = Math.max(
    1,
    viewportWidth - padding * 2,
  );

  const usableHeight = Math.max(
    1,
    viewportHeight - padding * 2,
  );

  const scale = Math.min(
    usableWidth / screenWidth,
    usableHeight / screenHeight,
  );

  return clampZoom(
    Math.floor(scale * 100),
  );
}

export function clampZoom(
  value: number,
): number {
  return Math.max(
    5,
    Math.min(150, value),
  );
}

export function viewportPointToDevice(
  clientX: number,
  clientY: number,
  rect: DOMRect,
  screenWidth: number,
  screenHeight: number,
  contentOffsetX = 0,
  contentOffsetY = 0,
  contentWidth = rect.width,
  contentHeight = rect.height,
): Point {
  /*
   * Coordinate mapping must use the actual rendered
   * screenshot content box, not the decorated device frame.
   *
   * rect may include CSS borders. contentOffset/contentSize
   * describe the inner box that owns the screenshot pixels.
   */

  const safeWidth =
    Math.max(
      1,
      contentWidth,
    );

  const safeHeight =
    Math.max(
      1,
      contentHeight,
    );

  const contentLeft =
    rect.left + contentOffsetX;

  const contentTop =
    rect.top + contentOffsetY;

  const relativeX =
    (clientX - contentLeft)
    / safeWidth;

  const relativeY =
    (clientY - contentTop)
    / safeHeight;

  const normalizedX =
    Math.max(
      0,
      Math.min(
        1,
        relativeX,
      ),
    );

  const normalizedY =
    Math.max(
      0,
      Math.min(
        1,
        relativeY,
      ),
    );

  return {
    x: Math.max(
      0,
      Math.min(
        screenWidth - 1,
        Math.round(
          normalizedX
          * (screenWidth - 1),
        ),
      ),
    ),

    y: Math.max(
      0,
      Math.min(
        screenHeight - 1,
        Math.round(
          normalizedY
          * (screenHeight - 1),
        ),
      ),
    ),
  };
}

export interface ViewportBounds {
  left: number;
  top: number;
  width: number;
  height: number;
}

/*
 * Projects canonical device-space bounds into the actual
 * rendered screenshot content box.
 *
 * This is the inverse geometry of viewportPointToDevice().
 *
 * No platform, device model, resolution, orientation,
 * status-bar or zoom constants belong here.
 */
export function deviceBoundsToViewport(
  bounds: ElementBounds,
  screenWidth: number,
  screenHeight: number,
  contentWidth: number,
  contentHeight: number,
  contentOffsetX = 0,
  contentOffsetY = 0,
): ViewportBounds {
  const safeScreenWidth =
    Math.max(1, screenWidth);

  const safeScreenHeight =
    Math.max(1, screenHeight);

  const safeContentWidth =
    Math.max(1, contentWidth);

  const safeContentHeight =
    Math.max(1, contentHeight);

  const scaleX =
    safeContentWidth / safeScreenWidth;

  const scaleY =
    safeContentHeight / safeScreenHeight;

  return {
    left:
      contentOffsetX
      + bounds.x * scaleX,

    top:
      contentOffsetY
      + bounds.y * scaleY,

    width:
      bounds.width * scaleX,

    height:
      bounds.height * scaleY,
  };
}

export function containsPoint(
  bounds: ElementBounds | null,
  point: Point,
): boolean {
  if (!bounds) {
    return false;
  }

  return (
    point.x >= bounds.x &&
    point.y >= bounds.y &&
    point.x <= bounds.x + bounds.width &&
    point.y <= bounds.y + bounds.height
  );
}

export function findDeepestElementAtPoint(
  elements: InspectorElement[],
  point: Point,
): InspectorElement | null {
  const candidates =
    elements.filter(
      (element) =>
        element.displayed
        && containsPoint(
          element.bounds,
          point,
        ),
    );

  if (!candidates.length) {
    return null;
  }

  const byId =
    new Map(
      elements.map(
        (element) => [
          element.id,
          element,
        ],
      ),
    );

  const depthOf = (
    element: InspectorElement,
  ): number => {
    let depth = 0;
    let parentId = element.parentId;

    const visited =
      new Set<string>();

    while (
      parentId
      && !visited.has(parentId)
    ) {
      visited.add(parentId);

      const parent =
        byId.get(parentId);

      if (!parent) {
        break;
      }

      depth += 1;
      parentId = parent.parentId;
    }

    return depth;
  };

  const areaOf = (
    element: InspectorElement,
  ): number => {
    if (!element.bounds) {
      return Number.MAX_SAFE_INTEGER;
    }

    return Math.max(
      1,
      element.bounds.width
      * element.bounds.height,
    );
  };

  const semanticScore = (
    element: InspectorElement,
  ): number => {
    let score = 0;

    /*
     * Semantics are intentionally only a final tie-breaker.
     *
     * Inspect must expose the most specific visual hierarchy
     * node under the pointer even when that node has no
     * resource id, accessibility id, text or clickable flag.
     */
    if (element.accessibilityId?.trim()) {
      score += 5;
    }

    if (element.resourceId?.trim()) {
      score += 4;
    }

    if (element.text?.trim()) {
      score += 3;
    }

    if (element.name?.trim()) {
      score += 2;
    }

    if (element.label?.trim()) {
      score += 2;
    }

    if (element.clickable) {
      score += 1;
    }

    return score;
  };

  candidates.sort(
    (left, right) => {
      /*
       * Inspector contract:
       *
       * 1. Deepest hierarchy node wins.
       *
       * This is deliberately different from interaction and
       * recording target resolution. Inspect is visual and
       * must allow selecting non-clickable leaf elements.
       */
      const depthDifference =
        depthOf(right)
        - depthOf(left);

      if (depthDifference !== 0) {
        return depthDifference;
      }

      /*
       * 2. At the same hierarchy depth, prefer the smallest
       * bounds containing the pointer.
       */
      const areaDifference =
        areaOf(left)
        - areaOf(right);

      if (areaDifference !== 0) {
        return areaDifference;
      }

      /*
       * 3. Semantics are only a tie-breaker.
       */
      const semanticDifference =
        semanticScore(right)
        - semanticScore(left);

      if (semanticDifference !== 0) {
        return semanticDifference;
      }

      /*
       * 4. Stable deterministic ordering.
       */
      return right.index - left.index;
    },
  );

  return candidates[0] ?? null;
}

export function buildElementSubtree(
  root: InspectorElement,
  elements: InspectorElement[],
): InspectorElement[] {
  const byId = new Map(
    elements.map((element) => [
      element.id,
      element,
    ]),
  );

  const result: InspectorElement[] = [];

  const visit = (
    element: InspectorElement,
  ) => {
    result.push(element);

    for (const childId of element.childrenIds) {
      const child = byId.get(childId);

      if (child) {
        visit(child);
      }
    }
  };

  visit(root);

  return result;
}

/*
 * Recorder-specific target resolution.
 *
 * A recording target is not necessarily the deepest XML node.
 * Prefer an actionable/semantic element whose bounds contain
 * the real device coordinate.
 */
export function findEditableElementAtPoint(
  elements: InspectorElement[],
  point: Point,
): InspectorElement | null {
  /*
   * Reuse the canonical hit-test algorithm, but restrict the
   * candidate set to elements whose live hierarchy metadata
   * explicitly reports editable=true.
   *
   * No widget class, resource id, application text or
   * platform-specific coordinate is hardcoded here.
   */
  return findDeepestElementAtPoint(
    elements.filter(
      (element) =>
        element.editable
        && element.enabled
        && element.displayed,
    ),
    point,
  );
}

export function findRecordingTargetAtPoint(
  elements: InspectorElement[],
  point: Point,
): InspectorElement | null {
  /*
   * Generic Recorder target resolver.
   *
   * No application names, package names, resource ids,
   * visible texts or application-specific semantics belong
   * here.
   *
   * Resolution is based only on runtime evidence:
   *   - hit testing
   *   - actionability
   *   - identity quality
   *   - geometry
   *   - pointer proximity
   */

  const candidates =
    elements.filter(
      (element) =>
        element.displayed
        && element.bounds
        && containsPoint(
          element.bounds,
          point,
        ),
    );

  if (!candidates.length) {
    return null;
  }

  const area = (
    element: InspectorElement,
  ): number => {
    const bounds = element.bounds;

    if (!bounds) {
      return Number.MAX_SAFE_INTEGER;
    }

    return Math.max(
      1,
      bounds.width
      * bounds.height,
    );
  };

  const centerDistance = (
    element: InspectorElement,
  ): number => {
    const bounds = element.bounds;

    if (!bounds) {
      return Number.MAX_SAFE_INTEGER;
    }

    const centerX =
      bounds.x
      + bounds.width / 2;

    const centerY =
      bounds.y
      + bounds.height / 2;

    return Math.hypot(
      point.x - centerX,
      point.y - centerY,
    );
  };

  const identitySignals = (
    element: InspectorElement,
  ): number => {
    return [
      element.resourceId,
      element.accessibilityId,
      element.text,
      element.name,
      element.label,
    ].filter(
      (value) =>
        Boolean(value?.trim()),
    ).length;
  };

  /*
   * Use the largest hit candidate only as a local geometric
   * reference. It is not assumed to be the device screen.
   */
  const referenceArea =
    Math.max(
      1,
      ...candidates.map(area),
    );

  const score = (
    element: InspectorElement,
  ): number => {
    let value = 0;

    /*
     * Runtime actionability is the strongest signal.
     */
    if (element.clickable) {
      value += 1000;
    }

    /*
     * Identity quality.
     *
     * Resource/accessibility identity is generally more
     * stable than visible presentation text, but none of
     * these signals alone is sufficient to select a target.
     */
    if (element.resourceId?.trim()) {
      value += 360;
    }

    if (element.accessibilityId?.trim()) {
      value += 340;
    }

    if (element.text?.trim()) {
      value += 220;
    }

    if (element.name?.trim()) {
      value += 160;
    }

    if (element.label?.trim()) {
      value += 140;
    }

    /*
     * Multiple independent identity signals increase
     * confidence without depending on their actual values.
     */
    const identities =
      identitySignals(element);

    if (identities >= 3) {
      value += 180;
    } else if (identities === 2) {
      value += 100;
    }

    /*
     * Geometry is structural evidence.
     *
     * A precise hit region is normally preferable to a
     * parent covering a large portion of the current view.
     */
    const relativeArea =
      area(element)
      / referenceArea;

    if (relativeArea <= 0.01) {
      value += 300;
    } else if (relativeArea <= 0.04) {
      value += 220;
    } else if (relativeArea <= 0.12) {
      value += 120;
    } else if (relativeArea >= 0.75) {
      value -= 600;
    } else if (relativeArea >= 0.40) {
      value -= 250;
    }

    /*
     * Prefer the candidate whose visual center is closest
     * to the actual physical touch point.
     *
     * Clamp the influence so geometry cannot overpower
     * actionability/identity.
     */
    const normalizedDistance =
      centerDistance(element)
      / Math.max(
        1,
        Math.sqrt(referenceArea),
      );

    value += Math.max(
      0,
      180
        - normalizedDistance * 180,
    );

    return value;
  };

  return (
    [...candidates]
      .sort(
        (left, right) => {
          const scoreDifference =
            score(right)
            - score(left);

          if (
            Math.abs(scoreDifference)
            > 0.001
          ) {
            return scoreDifference;
          }

          /*
           * Deterministic tie-breakers:
           * smaller hit region, then closest center.
           */
          const areaDifference =
            area(left)
            - area(right);

          if (areaDifference !== 0) {
            return areaDifference;
          }

          return (
            centerDistance(left)
            - centerDistance(right)
          );
        },
      )[0]
    ?? null
  );
}

/*
 * Recorder actionable hit-path resolver.
 *
 * Generic by design:
 * - no AUT/package/resource/text hardcoding
 * - coordinate must be inside bounds
 * - actionable semantics dominate visual semantics
 * - smaller/deeper candidates beat broad containers
 * - fail closed when evidence is insufficient
 */
export function findActionableRecordingTargetAtPoint(
  elements: InspectorElement[],
  point: Point,
): InspectorElement | null {
  const hits =
    elements.filter(
      (element) =>
        element.displayed
        && element.bounds
        && containsPoint(
          element.bounds,
          point,
        ),
    );

  if (!hits.length) {
    return null;
  }

  const area = (
    element: InspectorElement,
  ): number => {
    if (!element.bounds) {
      return Number.MAX_SAFE_INTEGER;
    }

    return Math.max(
      1,
      element.bounds.width
      * element.bounds.height,
    );
  };

  const identityStrength = (
    element: InspectorElement,
  ): number => {
    let score = 0;

    if (element.resourceId?.trim()) {
      score += 4;
    }

    if (element.accessibilityId?.trim()) {
      score += 4;
    }

    if (element.text?.trim()) {
      score += 2;
    }

    if (element.name?.trim()) {
      score += 1;
    }

    if (element.label?.trim()) {
      score += 1;
    }

    return score;
  };

  /*
   * First contract:
   * prefer genuinely actionable nodes.
   *
   * Do NOT select arbitrary TextView/ImageView/etc merely
   * because it visually contains the physical coordinate.
   */
  const actionable =
    hits.filter(
      (element) =>
        element.clickable,
    );

  if (actionable.length) {
    actionable.sort(
      (left, right) => {
        /*
         * Smaller bounds approximate the most specific
         * actionable node in the hit path.
         */
        const areaDifference =
          area(left)
          - area(right);

        if (areaDifference !== 0) {
          return areaDifference;
        }

        return (
          identityStrength(right)
          - identityStrength(left)
        );
      },
    );

    return actionable[0] ?? null;
  }

  /*
   * Fail closed.
   *
   * A non-clickable visual node is not enough evidence that
   * it owns the user's action. Coordinate fallback is safer
   * than recording incorrect semantics.
   */
  return null;
}
