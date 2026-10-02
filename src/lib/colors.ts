/** Label colors offered for clients (Trello-like). Any other #rrggbb can be picked too. */
export const PALETTE = [
  '#2fa565', // green
  '#e9a23b', // yellow
  '#f07a3a', // orange
  '#e0525a', // red
  '#8b6fe8', // purple
  '#2f6fde', // blue
  '#22a6c9', // sky
  '#7ab83a', // lime
  '#dd5aa6', // pink
  '#5b6270', // grey
];

export const isHex = (v: unknown): v is string => typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v);

/** Next palette color not yet used, so new clients start out distinct. */
export function nextColor(used: string[]): string {
  const taken = new Set(used.map((c) => c.toLowerCase()));
  return PALETTE.find((c) => !taken.has(c)) ?? PALETTE[used.length % PALETTE.length];
}

/** Dark or white text, whichever reads better on `hex`. */
export function inkOn(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return lum > 0.4 ? '#1b1f29' : '#ffffff';
}

/** The color at `alpha` over white, for soft backgrounds. */
export function tint(hex: string, alpha: number): string {
  const n = parseInt(hex.slice(1), 16);
  const mix = (c: number) => Math.round(c * alpha + 255 * (1 - alpha));
  return `rgb(${mix((n >> 16) & 255)}, ${mix((n >> 8) & 255)}, ${mix(n & 255)})`;
}
