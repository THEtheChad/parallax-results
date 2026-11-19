// Each implementation is told apart twice: by its series colour and by its shape, the same in the
// chips, the chart, the hero and the table (a colour alone fails under colour-vision deficiency).

export type ShapeName = "circle" | "square" | "triangle" | "diamond" | "cross";

const BY_SLOT: ShapeName[] = ["circle", "square", "triangle", "diamond", "cross"];
export const shapeOfSlot = (slot: number): ShapeName => BY_SLOT[(Math.max(1, slot) - 1) % BY_SLOT.length]!;

// Points of each shape in a unit box centred on 0, for the chart's polygons and this icon alike.
export function shapePoints(shape: ShapeName, r: number): [number, number][] {
  switch (shape) {
    case "triangle":
      return [
        [0, -r * 1.15],
        [r * 1.1, r * 0.8],
        [-r * 1.1, r * 0.8],
      ];
    case "diamond":
      return [
        [0, -r * 1.25],
        [r * 1.25, 0],
        [0, r * 1.25],
        [-r * 1.25, 0],
      ];
    case "cross": {
      const a = r * 0.42;
      const b = r * 1.15;
      return [
        [-a, -b], [a, -b], [a, -a], [b, -a], [b, a], [a, a],
        [a, b], [-a, b], [-a, a], [-b, a], [-b, -a], [-a, -a],
      ];
    }
    case "square":
      return [
        [-r * 0.9, -r * 0.9],
        [r * 0.9, -r * 0.9],
        [r * 0.9, r * 0.9],
        [-r * 0.9, r * 0.9],
      ];
    default:
      return [];
  }
}

export function Shape({ slot, size = 12, hollow = false }: { slot: number; size?: number; hollow?: boolean }) {
  const shape = shapeOfSlot(slot);
  const color = `var(--series-${slot})`;
  const r = 4.2;
  const paint = hollow ? { fill: "none", stroke: color, strokeWidth: 1.6 } : { fill: color };
  return (
    <svg className="shape" width={size} height={size} viewBox="-6 -6 12 12" aria-hidden="true">
      {shape === "circle" ? <circle r={r} {...paint} /> : <polygon points={shapePoints(shape, r).map((p) => p.join(",")).join(" ")} {...paint} />}
    </svg>
  );
}
