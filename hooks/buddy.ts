// The pane's mascot: Clawd, Claude Code's pixel crab, undercover in an
// incognito hat and dark glasses, holding a magnifying glass. He stands
// still; only his legs shuffle and his claws bob.
//
// Desktop (any surface with Svg): one SVG drawn in Clawd's own proportions
// (a 16×12 body on a 30×28 grid, as other Claude Code mods draw him), moved
// by CSS translations only, so it never needs a redraw. Terminal: Claude
// Code's logo glyphs, shuffled by the pane's tick.

const CLAY = '#D97757'
const INK = '#1F1E1D'
const HAT = '#4A4A4F'
const BAND = '#A1A1AA'
const RIM = '#B8B8BE'

// ---- desktop: SVG -------------------------------------------------------

type Fill = (x: number, y: number, w: number, h: number, c: string, cls?: string) => void

const stamp = (f: Fill, x: number, y: number, rows: string[], map: Record<string, string>, cls?: string) =>
  rows.forEach((row, dy) => [...row].forEach((ch, dx) => map[ch] && f(x + dx, y + dy, 1, 1, map[ch]!, cls)))

/** Clawd in disguise: `it` is the raised claw with the magnifier, `ba` the back claw. */
const incognitoClawd = (f: Fill) => {
  f(7, 10, 16, 12, CLAY)
  f(3, 14, 4, 4, CLAY, 'ba')
  f(23, 10, 4, 4, CLAY, 'it')
  f(7, 22, 2, 4, CLAY, 'la'); f(17, 22, 2, 4, CLAY, 'la')
  f(11, 22, 2, 4, CLAY, 'lb'); f(21, 22, 2, 4, CLAY, 'lb')
  // dark glasses with a glint
  f(8, 12, 5, 3, INK); f(17, 12, 5, 3, INK); f(13, 12, 4, 1, INK)
  f(9, 12, 1, 1, '#ffffff', 'gl'); f(18, 12, 1, 1, '#ffffff', 'gl')
  // incognito fedora, brim resting on the head
  stamp(f, 6, 4, [
    '.....hhhhhhhh.....',
    '....hhhhhhhhhh....',
    '....hhhhhhhhhh....',
    '....hhhhhhhhhh....',
    '....bbbbbbbbbb....',
    'hhhhhhhhhhhhhhhhhh',
  ], { h: HAT, b: BAND })
  // magnifier in the raised claw
  stamp(f, 23, 0, ['.rrrr.', 'r....r', 'r....r', 'r....r', 'r....r', '.rrrr.'], { r: RIM }, 'it')
  f(24, 1, 4, 4, 'rgba(169,214,245,.55)', 'it')
  f(24, 1, 1, 1, '#ffffff', 'it')
  f(25, 6, 2, 4, '#7A4A26', 'it')
}

const SCALE = 2
export const BUDDY_SVG_WIDTH = 30 * SCALE
export const BUDDY_SVG_HEIGHT = 28 * SCALE + 2

// Translations only (no flips or rotations), in grid units: 1 = 2 px.
const CSS = `<style>
.la{animation:st .8s steps(1) infinite}.lb{animation:st .8s steps(1) infinite -.4s}
.it{animation:lift 1.6s ease-in-out infinite}
.ba{animation:lift 1.6s ease-in-out infinite -.8s}
.gl{animation:blink 2.4s steps(1) infinite}
@keyframes st{50%{transform:translateY(-1px)}}
@keyframes lift{50%{transform:translateY(-1px)}}
@keyframes blink{80%{opacity:0}}
@media (prefers-reduced-motion: reduce){.la,.lb,.it,.ba,.gl{animation:none}}
</style>`

/** Clawd standing still, legs shuffling and claws bobbing. */
export function buddySvg(): string {
  const groups = new Map<string, string[]>()
  const f: Fill = (x, y, w, h, c, cls = 'bd') => {
    groups.set(cls, [...(groups.get(cls) ?? []), `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${c}"/>`])
  }
  incognitoClawd(f)
  const g = (cls: string) => `<g class="${cls}">${(groups.get(cls) ?? []).join('')}</g>`
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${BUDDY_SVG_WIDTH}" height="${BUDDY_SVG_HEIGHT}" viewBox="0 0 ${BUDDY_SVG_WIDTH} ${BUDDY_SVG_HEIGHT}">${CSS}<g transform="translate(0,1) scale(${SCALE})" shape-rendering="crispEdges">${['bd', 'ba', 'it', 'gl', 'la', 'lb'].map(g).join('')}</g></svg>`
}

// ---- terminal: Claude Code's logo glyphs --------------------------------

export type Run = { text: string; color?: string }

export const BUDDY_HEIGHT = 5 // hat (2) + body (2) + legs

/** The terminal Clawd at `tick`: standing still, his legs shuffling now and then. */
export function buddyRows(tick: number): Run[][] {
  const legs = Math.floor(tick / 3) % 2 === 1 ? '  ▝▝ ▘▘ ' : '  ▘▘ ▝▝ '
  return [
    [{ text: '   ▄▄▄▄▄   ', color: HAT }],
    [{ text: ' ▀▀▀▀▀▀▀▀▀ ', color: HAT }],
    [{ text: ' ▐▛███▜▌ ', color: CLAY }, { text: '🔍' }],
    [{ text: '▝▜█████▛▘', color: CLAY }],
    [{ text: legs, color: CLAY }],
  ]
}
