// shared helpers for the x14 effects. Frame contract: render(t, ctx) fills ctx.idx (Uint8Array, 320 x ctx.h indexed) and ctx.pal (Uint8Array 768, 8-bit RGB
// = 6-bit VGA value *255/63 floored, as the harness' display()), t = music seconds (libopenmpt position, = seconds since the start of effect 0).
// Tick rate = vsync rate of the effect's own CRTC timing (the PIT ISR is a software PLL on port 0x3da: one tick per retrace). 400-line effects (CRTC regs 6/7 = 0xbf/0x1f,
// 449 lines x 800 dot clocks at 25.175 MHz) run at 70.086 Hz; fx2, fx3, fx8, fx10 use the 480-line tweak (regs 6/7 = 0x0d/0x3e: 0x20d + 2 = 527 lines) = 70.086 * 449 / 527.
export const VSYNC = 70.086;
export const VSYNC480 = 70.086 * 449 / 527;      // 59.714 Hz; matches the dosbox-x slope 0.852 of fx2 and fx8
export const vsync = fx => [2, 3, 8, 10].includes(fx) ? VSYNC480 : VSYNC;
export const to8 = v => Math.floor(v * 255 / 63);
export async function load(a, url) { return new Uint8Array(a ?? await (await fetch(url)).arrayBuffer()); }
