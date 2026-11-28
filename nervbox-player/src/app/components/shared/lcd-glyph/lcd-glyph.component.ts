import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

export type LcdGlyphKind = 'shekel' | 'wood';

/**
 * Pixel glyphs for the account LCD, drawn on the same dot grid as a real LCD:
 * X = lit pixel. Unlit pixels enclosed by the outline are shown faintly, like the "8" ghost digits.
 */
const GLYPHS: Record<LcdGlyphKind, readonly string[]> = {
  // Münze mit „N“ (Schekel)
  shekel: [
    '...XXXX...',
    '.XX....XX.',
    '.X......X.',
    'X..X..X..X',
    'X..XX.X..X',
    'X..X.XX..X',
    'X..X..X..X',
    '.X......X.',
    '.XX....XX.',
    '...XXXX...',
  ],
  // Holzstapel: drei Scheite, Stirnseiten mit Kern
  wood: [
    '....XXX....',
    '...X...X...',
    '...X.X.X...',
    '...X...X...',
    '....XXX....',
    '.XXX...XXX.',
    'X...X.X...X',
    'X.X.X.X.X.X',
    'X...X.X...X',
    '.XXX...XXX.',
  ],
};

/** Unlit pixels that cannot be reached from the border, i.e. the inside of the drawn shapes. */
function enclosed(rows: readonly string[]): Set<string> {
  const h = rows.length;
  const w = rows[0].length;
  const outside = new Set<string>();
  const stack: [number, number][] = [];
  for (let x = 0; x < w; x++) stack.push([x, 0], [x, h - 1]);
  for (let y = 0; y < h; y++) stack.push([0, y], [w - 1, y]);
  while (stack.length) {
    const [x, y] = stack.pop()!;
    const key = `${x},${y}`;
    if (x < 0 || y < 0 || x >= w || y >= h || outside.has(key) || rows[y][x] === 'X') continue;
    outside.add(key);
    stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
  }
  const inside = new Set<string>();
  rows.forEach((row, y) => {
    for (let x = 0; x < w; x++)
      if (row[x] !== 'X' && !outside.has(`${x},${y}`)) inside.add(`${x},${y}`);
  });
  return inside;
}

function toPath(rows: readonly string[], pick: (x: number, y: number) => boolean): string {
  let d = '';
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) if (pick(x, y)) d += `M${x} ${y}h1v1h-1z`;
  });
  return d;
}

/** Monochrome LCD pixel symbol (Schekel coin / Holz log) in front of an LCD value. */
@Component({
  selector: 'app-lcd-glyph',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <svg
      class="nk-lcd__glyph"
      [attr.viewBox]="viewBox()"
      [style.--nk-glyph-cols]="cols()"
      shape-rendering="crispEdges"
      aria-hidden="true"
      focusable="false"
    >
      <path class="nk-lcd__glyph-off" [attr.d]="offPath()"></path>
      <path class="nk-lcd__glyph-on" [attr.d]="onPath()"></path>
    </svg>
  `,
  host: { class: 'nk-lcd__glyph-host' },
})
export class LcdGlyphComponent {
  readonly kind = input.required<LcdGlyphKind>();

  private readonly rows = computed(() => GLYPHS[this.kind()]);
  readonly cols = computed(() => this.rows()[0].length);
  readonly viewBox = computed(() => `0 0 ${this.cols()} ${this.rows().length}`);
  readonly onPath = computed(() => {
    const rows = this.rows();
    return toPath(rows, (x, y) => rows[y][x] === 'X');
  });
  readonly offPath = computed(() => {
    const inside = enclosed(this.rows());
    return toPath(this.rows(), (x, y) => inside.has(`${x},${y}`));
  });
}
