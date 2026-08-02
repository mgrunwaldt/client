import { clampContactToRadius } from "../../match/kick-input";

const GRID_AXIS = [-Math.SQRT1_2, 0, Math.SQRT1_2] as const;

export const CONTACT_GRID_LABELS = [
  "Upper left",
  "Upper center",
  "Upper right",
  "Center left",
  "Center",
  "Center right",
  "Lower left",
  "Lower center",
  "Lower right",
] as const;

export function contactForGridIndex(index: number, radius: number) {
  const row = Math.floor(index / 3);
  const column = index % 3;
  return clampContactToRadius(
    { x: GRID_AXIS[column] * radius, y: -GRID_AXIS[row] * radius },
    radius,
  );
}

export function moveContactGridIndex(
  index: number,
  key: "ArrowUp" | "ArrowDown" | "ArrowLeft" | "ArrowRight",
) {
  const row = Math.floor(index / 3);
  const column = index % 3;
  const nextRow =
    key === "ArrowUp"
      ? Math.max(0, row - 1)
      : key === "ArrowDown"
        ? Math.min(2, row + 1)
        : row;
  const nextColumn =
    key === "ArrowLeft"
      ? Math.max(0, column - 1)
      : key === "ArrowRight"
        ? Math.min(2, column + 1)
        : column;
  return nextRow * 3 + nextColumn;
}
