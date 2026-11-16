/** Tunable hull, rig, and sail numbers for an ILCA/Laser-like dinghy. */

export const RHO_AIR = 1.225;
export const RHO_WATER = 1025;
export const G = 9.81;

export const MASS = 135;
export const SAIL_AREA = 7.06;
export const CREW_MASS = 78;
export const CE_HEIGHT = 2.05;
export const I_ROLL = 36;
export const I_YAW = 68;

/** Righting moment per sin(heel), N·m. Assisted mode is stiffer (forgiveness). */
export const HULL_RIGHTING_MANUAL = 420;
export const HULL_RIGHTING_ASSIST = 780;
export const ROLL_DAMP = 150;

export const CREW_OFFSET_MIN = 0.12;
export const CREW_OFFSET_MAX = 1.02;

export const BOARD_AREA = 0.36;
export const BOARD_CLA = 2.15;
export const BOARD_AR = 2.8;
export const BOARD_STALL = 0.17;

export const HULL_DRAG_LIN = 7;
export const HULL_DRAG_QUAD = 12.5;
/** Extra quadratic drag at the displacement/planing hump (Fr ≈ 0.5). */
export const HULL_HUMP = 16;
export const WATERLINE = 3.85;

export const RUDDER_AREA = 0.058;
export const RUDDER_STALL = 0.30;
export const RUDDER_STALL_ASSIST = 0.40;
export const RUDDER_LEVER = 1.65;
export const MAX_RUDDER = 0.61;

/** 0.5 * Cd * A for mast, sailor, and topsides. */
export const WINDAGE = 0.34;

export const BOOM_IN = 0.06;
export const BOOM_OUT = 1.48;
export const OPT_AOA = 0.30;
export const TWIST = 0.10;
export const STALL_AOA = 0.44;
export const STALL_AOA_ASSIST = 0.54;
export const LUFF_AOA = 0.13;

export const WEATHER_HELM = 48;
export const WEATHERCOCK = 1.15;
/** Yaw from drive acting out along the boom (bear-away on a deep run). */
export const BOOM_YAW = 0.4;

export const CAPSIZE_MANUAL = 1.12;
export const CAPSIZE_ASSIST = 1.38;
export const RECOVERY_TIME = 3.5;

export const SHEET_RATE = 0.7;

export const PLANING_WIND = 6.7;
export const PLANING_DROP = 0.38;
