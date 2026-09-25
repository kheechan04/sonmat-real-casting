// Pose data types shared by the camera path, replay path and Node tests.
// No DOM or MediaPipe imports here so this runs under plain Node.
// Copied from Shadow Mitts (src/core/pose.ts) and extended with the hand points used for reeling.

/** [x, y, z, visibility] */
export type P4 = [number, number, number, number];

/** One processed video frame. lm/wl are null when no pose was detected. */
export interface PoseFrame {
  /** Source clock in ms (camera: performance.now() at detection; replay: recorded time). */
  t: number;
  /** Normalized image landmarks (33 entries), camera image space, NOT mirrored. */
  lm: P4[] | null;
  /** World landmarks in meters (33 entries). Axis directions: docs/VERIFICATION.md. */
  wl: P4[] | null;
}

// MediaPipe Pose landmark indices. "L"/"R" are the person's own anatomical left/right.
export const LM = {
  NOSE: 0,
  SHOULDER_L: 11,
  SHOULDER_R: 12,
  ELBOW_L: 13,
  ELBOW_R: 14,
  WRIST_L: 15,
  WRIST_R: 16,
  PINKY_L: 17,
  PINKY_R: 18,
  INDEX_L: 19,
  INDEX_R: 20,
  THUMB_L: 21,
  THUMB_R: 22,
  HIP_L: 23,
  HIP_R: 24,
} as const;

export type Side = 'left' | 'right';
export const SIDES: readonly Side[] = ['left', 'right'];
export const other = (s: Side): Side => (s === 'left' ? 'right' : 'left');

export interface ArmIndices {
  shoulder: number;
  elbow: number;
  wrist: number;
  index: number;
}

export const ARM: Record<Side, ArmIndices> = {
  left: { shoulder: LM.SHOULDER_L, elbow: LM.ELBOW_L, wrist: LM.WRIST_L, index: LM.INDEX_L },
  right: { shoulder: LM.SHOULDER_R, elbow: LM.ELBOW_R, wrist: LM.WRIST_R, index: LM.INDEX_R },
};

/** Human-readable names for the landmarks the observer shows. */
export const LM_NAMES: Record<number, string> = {
  [LM.NOSE]: '코',
  [LM.SHOULDER_L]: '왼어깨',
  [LM.SHOULDER_R]: '오른어깨',
  [LM.ELBOW_L]: '왼팔꿈치',
  [LM.ELBOW_R]: '오른팔꿈치',
  [LM.WRIST_L]: '왼손목',
  [LM.WRIST_R]: '오른손목',
  [LM.INDEX_L]: '왼검지',
  [LM.INDEX_R]: '오른검지',
  [LM.HIP_L]: '왼골반',
  [LM.HIP_R]: '오른골반',
};

/** Upper-body skeleton edges for drawing. */
export const UPPER_BODY_EDGES: readonly [number, number][] = [
  [LM.SHOULDER_L, LM.SHOULDER_R],
  [LM.SHOULDER_L, LM.ELBOW_L], [LM.ELBOW_L, LM.WRIST_L],
  [LM.SHOULDER_R, LM.ELBOW_R], [LM.ELBOW_R, LM.WRIST_R],
  [LM.WRIST_L, LM.INDEX_L], [LM.WRIST_R, LM.INDEX_R],
  [LM.WRIST_L, LM.PINKY_L], [LM.WRIST_R, LM.PINKY_R],
  [LM.SHOULDER_L, LM.HIP_L], [LM.SHOULDER_R, LM.HIP_R], [LM.HIP_L, LM.HIP_R],
];
