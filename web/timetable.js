// Pure helpers (no DOM): effect timetable + 4:3 display sizing. Tested by test-player.mjs.
import { at } from './fx/timeline.js';
import { ENTRY, entryTime } from './fx/entries.js';
export const DUR = 251;
// effect entry (order,row) = S3M position at which the Unicorn harness saw the effect routine called (re/golden/log.txt, rounded down to the row;
// a measurement of the harness' virtual clock, see re/NOTES.md); times from the libopenmpt-derived timeline.
export const FX = [
  [0, 0, 'hoplite/dune logos'], [4, 0, 'swirl warp'], [9, 0, 'brown rotozoom'], [15, 1, 'logo text'], [16, 16, 'leaf tunnel'], [21, 39, 'marble warp'],
  [25, 1, 'picture + fade'], [28, 16, 'colour ring'], [33, 0, 'organic blob'], [37, 0, 'terrain'], [41, 0, 'red vortex'], [44, 48, 'twisted column'], [58, 0, 'column + greets'],
].map(([o, r, name], i, a) => ({ i, t0: ENTRY[i] ? entryTime(i) : at(o, r), t1: i + 1 < a.length ? (ENTRY[i + 1] ? entryTime(i + 1) : at(a[i + 1][0], a[i + 1][1])) : DUR, name }));
export const fxAt = t => { let k = 0; for (const e of FX) if (t >= e.t0) k = e.i; return k; };
export const fmt = s => Math.floor(s / 60) + ':' + String(Math.floor(s % 60)).padStart(2, '0');
// Display size in CSS px for a 4:3 picture: integer multiple of 320 device px when >=1, else fit.
export function displaySize(availW, availH, dpr = 1) {
  const fitW = Math.min(availW, availH * 4 / 3) * dpr, k = Math.floor(fitW / 320);
  const w = (k >= 1 ? 320 * k : fitW) / dpr;
  return { w, h: w * 3 / 4 };
}
