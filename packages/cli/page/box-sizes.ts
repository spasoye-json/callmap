import { COUNT_CHIP_SIZE } from './chips.ts';

export const LEVEL_PADDING = 12;
export const ICON_SIZE = 14;
export const ICON_ROOM = ICON_SIZE + 7;
export const COUNT_GAP = 4;
export const COUNTS_GAP = 10;
export const DIGIT_WIDTH = 7;

export const countWidthOf = (count: number): number =>
  COUNT_CHIP_SIZE + COUNT_GAP + String(count).length * DIGIT_WIDTH;

export const LEVEL_BOX_HEIGHT = 64;
export const LEVEL_ROW_OFFSET = 11;
export const FUNCTION_COUNT_GAP = 8;
export const SMALL_CHARACTER_WIDTH = 6.6;

export const functionCountOf = (functions: number): string => `${String(functions)} fn`;

export const functionCountWidthOf = (functions: number): number =>
  FUNCTION_COUNT_GAP + Math.ceil(functionCountOf(functions).length * SMALL_CHARACTER_WIDTH);
