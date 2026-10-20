import { COUNT_CHIP_SIZE } from './chips.ts';

export const LEVEL_PADDING = 12;
export const ICON_SIZE = 14;
export const ICON_ROOM = ICON_SIZE + 7;
export const COUNT_GAP = 4;
export const COUNTS_GAP = 10;
export const DIGIT_WIDTH = 7;

export const countWidthOf = (count: number): number =>
  COUNT_CHIP_SIZE + COUNT_GAP + String(count).length * DIGIT_WIDTH;
