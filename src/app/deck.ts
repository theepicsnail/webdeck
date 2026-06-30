export const DEFAULT_DECK_SIZE = 8;
export const MAX_DECK_SIZE = 16;

export type DeckButtonConfig = {
  label: string;
  imageDataUrl?: string;
  imageUrl?: string;
  columnSpan: number;
  rowSpan: number;
  moduleId: string;
  eventId: string;
  params: Record<string, string>;
};

export type DeckLayoutConfig = {
  rows: number;
  columns: number;
};

export function createEmptyDeckButtonConfig(): DeckButtonConfig {
  return {
    label: "",
    columnSpan: 1,
    rowSpan: 1,
    moduleId: "",
    eventId: "",
    params: {},
  };
}

export function normalizeDeckLayout(value: unknown): DeckLayoutConfig {
  if (!value || typeof value !== "object") {
    return { rows: DEFAULT_DECK_SIZE, columns: DEFAULT_DECK_SIZE };
  }

  const layout = value as Partial<DeckLayoutConfig>;
  return {
    rows: clampDeckDimension(Number(layout.rows)),
    columns: clampDeckDimension(Number(layout.columns)),
  };
}

export function clampDeckDimension(value: number): number {
  return Number.isFinite(value)
    ? Math.max(1, Math.min(MAX_DECK_SIZE, Math.round(value)))
    : DEFAULT_DECK_SIZE;
}

export function clampSpan(value: unknown, maximum: number): number {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(1, Math.min(maximum, Math.round(number))) : 1;
}

export function isDeckButtonConfig(value: unknown): value is DeckButtonConfig {
  if (!value || typeof value !== "object") {
    return false;
  }

  const config = value as Partial<DeckButtonConfig>;
  return (
    (typeof config.label === "string" || typeof config.label === "undefined") &&
    typeof config.moduleId === "string" &&
    typeof config.eventId === "string" &&
    !!config.params &&
    typeof config.params === "object" &&
    !Array.isArray(config.params)
  );
}

export function normalizeDeckButtonConfig(value: unknown): DeckButtonConfig | undefined {
  if (!isDeckButtonConfig(value)) {
    return undefined;
  }

  return {
    label: value.label ?? "",
    imageDataUrl: typeof value.imageDataUrl === "string" ? value.imageDataUrl : undefined,
    imageUrl: typeof value.imageUrl === "string" ? value.imageUrl : undefined,
    columnSpan: clampSpan(value.columnSpan, MAX_DECK_SIZE),
    rowSpan: clampSpan(value.rowSpan, MAX_DECK_SIZE),
    moduleId: value.moduleId,
    eventId: value.eventId,
    params: value.params,
  };
}

export function coveredCellIndexes(
  index: number,
  columnSpan: number,
  rowSpan: number,
  layout: DeckLayoutConfig,
): number[] {
  const startColumn = index % layout.columns;
  const startRow = Math.floor(index / layout.columns);
  const indexes: number[] = [];

  for (let row = startRow; row < startRow + rowSpan; row += 1) {
    for (let column = startColumn; column < startColumn + columnSpan; column += 1) {
      indexes.push(row * layout.columns + column);
    }
  }

  return indexes;
}

export function canButtonOccupySpan(
  index: number,
  columnSpan: number,
  rowSpan: number,
  layout: DeckLayoutConfig,
  buttons: Array<DeckButtonConfig | undefined>,
): boolean {
  const startColumn = index % layout.columns;
  const startRow = Math.floor(index / layout.columns);

  if (startColumn + columnSpan > layout.columns || startRow + rowSpan > layout.rows) {
    return false;
  }

  return coveredCellIndexes(index, columnSpan, rowSpan, layout).every(
    (coveredIndex) => coveredIndex === index || !buttons[coveredIndex],
  );
}

export function effectiveButtonSpan(
  index: number,
  config: DeckButtonConfig | undefined,
  occupied: Set<number>,
  layout: DeckLayoutConfig,
  buttons: Array<DeckButtonConfig | undefined>,
): { columnSpan: number; rowSpan: number } {
  const requestedColumns = clampSpan(config?.columnSpan, layout.columns);
  const requestedRows = clampSpan(config?.rowSpan, layout.rows);

  for (let area = requestedColumns * requestedRows; area >= 1; area -= 1) {
    for (let rowSpan = requestedRows; rowSpan >= 1; rowSpan -= 1) {
      for (let columnSpan = requestedColumns; columnSpan >= 1; columnSpan -= 1) {
        if (
          columnSpan * rowSpan !== area ||
          !canButtonOccupySpan(index, columnSpan, rowSpan, layout, buttons)
        ) {
          continue;
        }

        const cells = coveredCellIndexes(index, columnSpan, rowSpan, layout);
        if (cells.every((cellIndex) => cellIndex === index || !occupied.has(cellIndex))) {
          return { columnSpan, rowSpan };
        }
      }
    }
  }

  return { columnSpan: 1, rowSpan: 1 };
}

export function markOccupiedCells(
  index: number,
  columnSpan: number,
  rowSpan: number,
  occupied: Set<number>,
  layout: DeckLayoutConfig,
): void {
  for (const cellIndex of coveredCellIndexes(index, columnSpan, rowSpan, layout)) {
    if (cellIndex !== index) {
      occupied.add(cellIndex);
    }
  }
}
