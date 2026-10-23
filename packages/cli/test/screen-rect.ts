export interface ScreenRect {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

export const meets = (one: ScreenRect, other: ScreenRect): boolean =>
  one.left < other.right &&
  other.left < one.right &&
  one.top < other.bottom &&
  other.top < one.bottom;

export const boundsOf = (rects: readonly ScreenRect[]): ScreenRect => ({
  left: Math.min(...rects.map(({ left }) => left)),
  top: Math.min(...rects.map(({ top }) => top)),
  right: Math.max(...rects.map(({ right }) => right)),
  bottom: Math.max(...rects.map(({ bottom }) => bottom)),
});
