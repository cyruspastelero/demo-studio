export const TEXT_BOX_CSS: string;
export const FRAME: { W: number; H: number };
export const TEXT_SIZE: { min: number; max: number; default: number };
export const DEFAULT_POS: { onscreen: [number, number]; pill: [number, number] };
export function keepInside(point: [number, number], box: { w: number; h: number }): [number, number];
export const DEFAULT_FONT: string;
export function fontFamily(id: string): string;
export function fontStack(id: string | undefined): string;
