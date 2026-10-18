export interface Position {
  readonly x: number;
  readonly y: number;
}

export interface PlacedFunction {
  readonly id: string;
  readonly file: string;
  readonly firstLine: number;
}

export interface PlacedCall {
  readonly caller: string;
  readonly callee: string;
}

export const BOX_WIDTH = 220;
export const BOX_HEIGHT = 36;

const BOX_GAP = 14;
const FRAME_HEADER = 34;
const FRAME_GAP = 70;
const COLUMN_GAP = 160;

const byText = (left: string, right: string): number => (left < right ? -1 : left > right ? 1 : 0);

const columnsOf = (
  files: readonly string[],
  fileCallers: ReadonlyMap<string, ReadonlySet<string>>,
): ReadonlyMap<string, number> => {
  const remaining = new Set(files);
  const columns = new Map<string, number>();
  for (let column = 0; remaining.size > 0; column += 1) {
    const ready = [...remaining].filter((file) =>
      [...(fileCallers.get(file) ?? [])].every((caller) => !remaining.has(caller)),
    );
    const placed = ready.length > 0 ? ready : [...remaining].slice(0, 1);
    for (const file of placed) {
      columns.set(file, column);
      remaining.delete(file);
    }
  }
  return columns;
};

export const layoutOf = (
  functions: readonly PlacedFunction[],
  calls: readonly PlacedCall[],
): ReadonlyMap<string, Position> => {
  const fileOf = new Map(functions.map(({ id, file }) => [id, file]));
  const files = [...new Set(fileOf.values())].sort(byText);

  const fileCallers = new Map<string, Set<string>>();
  for (const { caller, callee } of calls) {
    const from = fileOf.get(caller);
    const to = fileOf.get(callee);
    if (from === undefined || to === undefined || from === to) continue;
    const known = fileCallers.get(to);
    if (known === undefined) fileCallers.set(to, new Set([from]));
    else known.add(from);
  }

  const columns = columnsOf(files, fileCallers);
  const nextTop = new Map<number, number>();
  const positions = new Map<string, Position>();

  for (const file of files) {
    const column = columns.get(file) ?? 0;
    const boxes = functions
      .filter((placed) => placed.file === file)
      .sort((left, right) => left.firstLine - right.firstLine || byText(left.id, right.id));
    const x = column * (BOX_WIDTH + COLUMN_GAP);
    let y = (nextTop.get(column) ?? 0) + FRAME_HEADER;
    for (const { id } of boxes) {
      positions.set(id, { x, y: y + BOX_HEIGHT / 2 });
      y += BOX_HEIGHT + BOX_GAP;
    }
    nextTop.set(column, y + FRAME_GAP);
  }

  return positions;
};
