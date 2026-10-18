import type {
  InspectorElement,
  LocatorCandidate,
  Platform,
} from "../../types/mobile";

export type MobileRecordedAction =
  | "tap"
  | "swipe"
  | "back";

export type SwipeDirection =
  | "up"
  | "down"
  | "left"
  | "right";

export interface RecordedTarget {
  elementId: string;
  elementType: string;

  name: string | null;
  text: string | null;
  label: string | null;
  value: string | null;

  resourceId: string | null;
  accessibilityId: string | null;
}

export interface RecordedLocator {
  strategy: string;
  value: string;
  score: number;

  unique: boolean;
  stable: boolean;

  category: string;
  reason: string;

  template: string | null;
  parameterName: string | null;
  parameterExample: string | null;
}

export interface RecordedPoint {
  x: number;
  y: number;
}

export interface RecordedGesture {
  direction: SwipeDirection;
  start: RecordedPoint;
  end: RecordedPoint;
  durationMs: number;
}

export interface MobileRecordedStep {
  id: string;
  sequence: number;
  timestamp: number;

  action: MobileRecordedAction;

  target: RecordedTarget | null;

  locator: RecordedLocator | null;

  alternativeLocators:
    RecordedLocator[];

  point: RecordedPoint | null;

  gesture: RecordedGesture | null;
}

export interface MobileRecording {
  version: 1;

  id: string;

  platform: Platform;
  deviceId: string;
  applicationPackage: string;

  startedAt: number;
  stoppedAt: number | null;

  steps: MobileRecordedStep[];
}

export interface RecordTapInput {
  element?: InspectorElement;
  point: RecordedPoint;
}

export interface RecordSwipeInput {
  direction: SwipeDirection;
  start: RecordedPoint;
  end: RecordedPoint;
  durationMs: number;
}

function recordingId(): string {
  return `REC-${Date.now()}`;
}

function stepId(
  sequence: number,
): string {
  return `STEP-${Date.now()}-${sequence}`;
}

function locatorFromCandidate(
  candidate: LocatorCandidate,
): RecordedLocator {
  return {
    strategy: candidate.strategy,
    value: candidate.value,
    score: candidate.score,

    unique: candidate.unique,
    stable: candidate.stable,

    category: candidate.category,
    reason: candidate.reason,

    template: candidate.template,
    parameterName:
      candidate.parameterName,
    parameterExample:
      candidate.parameterExample,
  };
}

function targetFromElement(
  element: InspectorElement,
): RecordedTarget {
  return {
    elementId: element.id,
    elementType: element.elementType,

    name: element.name,
    text: element.text,
    label: element.label,
    value: element.value,

    resourceId: element.resourceId,
    accessibilityId:
      element.accessibilityId,
  };
}

function verifiedLocators(
  element: InspectorElement,
): LocatorCandidate[] {
  return element.locators
    .filter(
      (candidate) =>
        candidate.matchCount === 1
        && candidate.unique,
    )
    .sort(
      (left, right) =>
        Number(right.recommended)
          - Number(left.recommended)
        || right.score - left.score,
    );
}

function locatorSet(
  element: InspectorElement,
): {
  primary: RecordedLocator | null;
  alternatives: RecordedLocator[];
} {
  const verified =
    verifiedLocators(element);

  const primary =
    verified[0]
      ? locatorFromCandidate(
          verified[0],
        )
      : null;

  const alternatives =
    verified
      .slice(1, 4)
      .map(locatorFromCandidate);

  return {
    primary,
    alternatives,
  };
}

export function createRecording(
  platform: Platform,
  deviceId: string,
  applicationPackage: string,
): MobileRecording {
  return {
    version: 1,

    id: recordingId(),

    platform,
    deviceId,
    applicationPackage,

    startedAt: Date.now(),
    stoppedAt: null,

    steps: [],
  };
}

export function recordTap(
  recording: MobileRecording,
  input: RecordTapInput,
): MobileRecording {
  const locators =
    input.element
      ? locatorSet(input.element)
      : {
          primary: null,
          alternatives: [],
        };

  const sequence =
    recording.steps.length + 1;

  return {
    ...recording,

    steps: [
      ...recording.steps,
      {
        id: stepId(sequence),
        sequence,
        timestamp: Date.now(),

        action: "tap",

        target:
          input.element
            ? targetFromElement(
                input.element,
              )
            : null,

        locator:
          locators.primary,

        alternativeLocators:
          locators.alternatives,

        /*
         * Coordinates are always preserved for TAP.
         * They are both useful evidence and the fallback
         * execution strategy when semantic resolution fails.
         */
        point: input.point,

        gesture: null,
      },
    ],
  };
}

export function recordSwipe(
  recording: MobileRecording,
  input: RecordSwipeInput,
): MobileRecording {
  const sequence =
    recording.steps.length + 1;

  return {
    ...recording,

    steps: [
      ...recording.steps,
      {
        id: stepId(sequence),
        sequence,
        timestamp: Date.now(),

        action: "swipe",

        target: null,
        locator: null,
        alternativeLocators: [],

        point: null,

        gesture: {
          direction: input.direction,
          start: input.start,
          end: input.end,
          durationMs:
            input.durationMs,
        },
      },
    ],
  };
}

export function recordBack(
  recording: MobileRecording,
): MobileRecording {
  const sequence =
    recording.steps.length + 1;

  return {
    ...recording,

    steps: [
      ...recording.steps,
      {
        id: stepId(sequence),
        sequence,
        timestamp: Date.now(),

        action: "back",

        target: null,
        locator: null,
        alternativeLocators: [],

        point: null,
        gesture: null,
      },
    ],
  };
}

export function stopRecording(
  recording: MobileRecording,
): MobileRecording {
  return {
    ...recording,
    stoppedAt: Date.now(),
  };
}
