// shared helpers for the x14 effects. Frame contract: render(t, ctx) fills ctx.idx (Uint8Array, 320 x ctx.h indexed) and ctx.pal (Uint8Array 768, 8-bit RGB
// = 6-bit VGA value *255/63 floored, as the harness' display()), t = music seconds (libopenmpt position, = seconds since the start of effect 0).
export const VSYNC = 70.086;                     // VGA 70 Hz (the effects pace on port 0x3da, the harness models 70.086 Hz)
export const to8 = v => Math.floor(v * 255 / 63);
export async function load(a, url) { return new Uint8Array(a ?? await (await fetch(url)).arrayBuffer()); }
