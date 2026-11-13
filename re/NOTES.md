# x14 - reverse-engineering log
## Unpacking (done)
- X14.EXE = MZ + PKLITE 1.x. Real mode (16-bit stub, 386 code with 0x66/0x67 prefixes inside). `unpack_pklite.py` loads the MZ like DOS (PSP seg 0x1000, image seg 0x1010), emulates minimal int 21h under Unicorn and stops at the first fetch from low memory that the stub has WRITTEN (= start of the unpacked program):
  `python3 unpack_pklite.py ../X14.EXE x14` (needs user-site unicorn, no python -I). Result: entry **1010:03D9** (cs:ip after relocation; offset 0x3d9 in image.bin), 32,064 paragraphs written.
- Files: `x14.mem.gz` = 1 MB real-mode memory at stop (gunzip to use); `image.bin` = unpacked program from linear 0x10100 (= segment 0x1010:0), cut at the first 4 KB zero gap (0x15aea bytes = **code only, probably truncated**: strings like 'data.dat' also appear at linear 0x184dc and 0x3b55c, i.e. data/BSS lies beyond the gap; use x14.mem.gz for anything past it); `image.dis` = objdump -mi8086 listing from offset 0 (16-bit disassembly mis-decodes 32-bit operand/address prefixed code: check around prefixes).
- Strings seen: 'data.dat', 'x14', 'SCRM', 'ULTRASND' + GUS init text (Gravis UltraSound player, no SB mention seen). Offsets are in image.bin coordinates + 0x10100.
## Phase 1: harness + golden frames (done; nothing ported, nothing bit-exact)
Run: `cd re && python3 golden_run.py golden [IPS=12e6] [EVERY=2] [TMAX=260]` (about 13 min CPU for the full 250 s), then `python3 contact.py golden golden/contact.png 8 200`. `extract_data.py` writes `assets/`. User-site Unicorn, no `-I`. `x14.mem` (gunzip of x14.mem.gz) is expected in the scratchpad/parent dir, see the top of emu.py.
### Program structure
- Unpacked entry 1010:03D9 is a real-mode stub: probes DPMI/VCPI/XMS (absent), int 15h/88, A20, lgdt, CR0.PE, far jump 8:0x259 into a custom 32-bit "raw" PM kernel. Flat base 0x10fc0 (4G limit, code+data).
- Unicorn 16-bit `emu_start` truncates IP to 16 bits, so `emu.to_pm32()` runs the stub to PM entry and clones the state into a UC_MODE_32 instance.
- DOS/BIOS gate = software `int 33h`, AL = real-mode int number, register block at flat+0xd0 (bx d4, dx d8, cx dc, ax e0, flags e4, es e6, ds e8), segment:offset -> (seg<<4)+off. CF must be set in the CPU EFLAGS from the result (a stale CF truncated the DATA.DAT bounce reads to 4 KB: fixed in `Regs.cf`). Service gates [0x28]/[0x2c] get/set IDT vectors; IRQ0 = IDT[8].
- VGA: assumes mode 13h then programs unchained mode X itself (320x400, crtc 9=0x40, stride 0x28). Palette via `rep outsb` (Unicorn cannot hook OUTS: 33 sites hooked by address in `OUTSB`). Planar shadow from stv/re/emu.py.
- PIT mode 0 one-shot re-armed every frame (retrace-synced), about 70 IRQ0/s; modelled in virtual time. 3DA retrace derived from virtual time (60 us warp per poll).
### Timeline
- GUS player vars: [0x3572] row byte, [0x3573] row word, [0x3575]/[0x3576] order, [0x3578] pattern. Effects switch on ORDER (`cmpb $N,0x3575`).
- No-sound flag [0x5fe7]==1 makes each tick handler count rows itself (70 rows/s: wrong tempo). The harness sets it to 0 at effect 0 and overwrites the vars each chunk from `s3mtime.json` (s3mtime.py: 64 orders, 3976 rows, 250.6 s, speed 6/tempo 144). Virtual clock = executed instructions / IPS (12e6, an approximation, not calibrated) + retrace warp.
- Effect entry points (flat): intro 0x25a14, fx0 0xd8ef, 1 0x25c55, 2 0x2939d, 3 0x2a607, 4 0x495bc, 5 0x4be79, 6 0x2a8bf, 7 0x4d5c5, 8 0x512fd, 9 0x57cf9, 10 0x5a9a4, 11 0x69fb2, 12 0x7aae4.
### Effects (golden times; order from the harness; look from golden/contact.png)
| fx | start (s) | order | what it looks like | state |
|---|---|---|---|---|
| 0 | 0 (2.3 vt) | 0 | "hoplite"/"dune" logos fading in a radial zoom, black until ~2 s | accumulating (tick handler 0xdba4) |
| 1 | 20.9 | 4 | swirling plasma/warp, colorful | accumulating |
| 2 | 54 | 9 | brown radial rotozoom texture, then flash (50-52 s) | accumulating |
| 3 | 74 | 15 | wood-grain texture + 3D logo text | accumulating |
| 4 | 78 | 16 | leaf/fur textured tunnel with "x14" strip | accumulating |
| 5 | 96 | 21 | smoky marbled warp | accumulating |
| 6 | 107 | 25 | still picture (clock tower figure) then fade | pure of time probably (static image + fade) |
| 7 | 118 | 28 | colored ring/tunnel growing from a dot | accumulating |
| 8 | 134 | 33 | orange organic blob (bump/env mapped) | accumulating |
| 9 | 147 | 37 | brown crust/terrain deformation | accumulating |
| 10 | 160.7 | 41 | red vortex with "x14" side strip | accumulating |
| 11 | 173 | 45 | rotating twisted textured column + scroller text greets (to ~217 s) | accumulating (rotation) |
| 12 | 217 | 57? | same column + long greetings list, until the end ~250 s | accumulating |
Classification caveat: tick handlers integrate per-IRQ state with constant increments `& 0xfff` and order-dependent branches, so state = f(ticks since effect start, order/row history). Not pure of t in closed form, but a seek can fast-forward by running the handler N times (or checkpoints). Per-effect classification beyond that is from the code pattern and screenshots, not verified individually.
### DATA.DAT
Concatenation of blobs loaded by absolute offset or from end of file (int 21h/42h whence 2) with a 4 KB bounce buffer ([0x6944]=4096, loader 0x6aad). Images: RIX3 `assets/rix_000000_640x200_4bpp.png` (48-byte 4bpp palette) and `rix_00fa3a_256x200_8bpp.png`. `assets/datdat_64k_blocks.png` = block overview. Read log per effect: `golden/events.json`. Other blobs (textures, tables) not yet decoded.
### Known limitations
- CRTC line-compare split not modelled: garbage rows at the bottom of some frames.
- Timing from IPS=12e6, so effect start times are approximate (golden vt is ~2.3 s ahead of music_t by construction).
- Frames are goldens for later comparison only; no frame-exactness claim for any port (no port exists).
## Phase 2: per-frame oracle + JS port of fx3 and fx6
Files: `re/fx_oracle.py` (oracle), `re/oracle2/` (fx3.npy, fx6.npy, log.txt, entry.json: pickled per-upload snapshots; first run (deleted): its S3M variables were refreshed per 2000-instruction chunk, which lags up to 30 ms inside 3DA spin loops (each poll warps the clock 60 us), so its fade-out start was 3 vsyncs early; superseded), `tools/export_assets.py`, `tools/oracle2bin.py`, `tools/mk_entries.py`, `tools/fxcheck.mjs`, `tools/mk_timeline_openmpt.py` + `mk_timeline.py` (libopenmpt row times -> web/fx/timeline.js; `re/s3mtime.model.json` = the harness' model times, `re/s3mtime.json` = libopenmpt's).
### Oracle (re/fx_oracle.py)
`python3 fx_oracle.py OUTDIR 3,6 12e6 2000` (about 14 min). Same driver as golden_run.py with: (1) a hook after every palette upload (wrapper on `_rep_outsb`, all 33 `rep outsb` sites): stores vt, music time, IRQ count, order/row, the 256x3 6-bit DAC, CRTC/seq/GC registers, and the displayed index plane (first and last upload); (2) the S3M variables [0x3572..0x3578] refreshed from the exact clock at every READ (memory read hook) instead of per chunk; (3) chunk = 2000 instructions (IRQ0 granularity 0.17 ms at IPS 12e6; the IRQ is still injected between chunks, not per instruction). Uses the model times (s3mtime.model.json).
Harness fix: `emu.display_idx()` now honours CRTC line compare (0x18, 7.4, 9.6: scan lines after the compare restart at address 0), start address, stride and max-scan-line doubling. NOT validated on an original frame: fx3 (mode 13h tweaked to 320x240, crtc 0x18=0xff, 7=0x3e, 9=0x41) and fx6 (BIOS 13h) never trigger a split (compare line = 0x3ff), so the garbage rows of earlier golden frames are not yet explained.
### fx3 (0x2a607) and fx6 (0x2a8bf): what the code does (read from flat.dis, not guessed)
- Both: PCX file (DATA.DAT, read through the 4 KB bounce loader 0x6aad after a seek from the END: fx3 -0x44480, 0x4480 bytes = file offset 652229; fx6 -0x4fb97, 0xb6e1 = offset 605358), decoded by 0x2a5b3 (skip 128 header bytes, RLE: byte>=0xC0 -> run (b&0x3f) of next byte, else literal, until 64000 pixels; skip 1 byte (0x0C), 768 palette bytes, stored >>2). The fx6 read ends 54 bytes short of the palette, entries >=238 are heap contents in the original (unused: max pixel index 157); export_assets.py zero-pads them.
- fx3: no mode set (inherits the 320x240 tweaked mode of fx2: 240 displayed lines); picture planes written at VRAM row 20 (`add $0x640`, 80 bytes/row), all other displayed pixels are index 0 (VRAM as fx2 leaves it, the oracle shows 0). Fade-in 64 steps from WHITE: (pal*i + 63*(64-i))>>6, i=0..63, one palette upload per vsync (wait 3DA bit3 set then clear, then upload); hold; when order >= 0x10 (16) 64 fade-out steps (pal*c)>>6, c=64..1, one per vsync from the first vsync after the order change; return.
- fx6: int 10h mode 13h, black palette, picture copied (movsl), 64 fade-in steps (pal*k>>6, k=0..63), hold while order < 0x1c (28), 64 fade-out steps c=64..1 (same pacing), return.
### Results (0 differences)
`node tools/fxcheck.mjs FX PREFIX` (after `python3 tools/oracle2bin.py re/oracle2 FX PREFIX [skip]`): render(t) sampled right after each of the 128 palette uploads and in the middle of every hold, against the Unicorn run, with the harness' own timeline: **fx3: 0 differing palette bytes (all samples), 0 differing picture bytes (320x240); fade-out start = first vsync after the order change** (oracle: vsync 219 = ceil(218.26)). **fx6: 0 differing picture bytes, palette 127 of 128 samples exact (fade-in 64 steps, hold, fade-out start = first vsync after the order change: oracle vsync 692 = ceil(691.70)); the one differing sample (frame 107's hold at vsync 736, 209 bytes) is a harness artifact: the oracle uploaded fade-out step 44 at vsync 736.93 instead of 736.0 (one late upload at 120.194 s virtual, the next upload is back on the grid), the port models ideal one-upload-per-vsync pacing. Not hidden: `node tools/fxcheck.mjs 6 PREFIX` prints it.**
### UNRESOLVED (not derived from the code)
- Entry time E of each effect (first fade-in upload): it follows the exit of the previous effect (fx2 / fx5, order-triggered) + machine-dependent init (file reads, PCX decode, `29ed6` PIT calibration over several vsyncs). The port uses the harness' virtual-clock measurement (`web/fx/entries.js`, stored as order,row,+dt and re-expressed on the libopenmpt timeline); the real value depends on the CPU/disk. Frame phase (vsync grid) is the harness' (edges at k/70.086 s of its virtual clock), arbitrary on real hardware.
- Pacing 70.086 Hz = the harness' retrace model (VGA 31.469 kHz / 449 lines); not read from the CRTC registers of the original.
- Musical clock: libopenmpt row times (player) vs the harness' model (0.07 % shorter); the oracle check uses the model, the player libopenmpt.
### Seek classification (from the code)
fx3, fx6: pure functions of t (palette = f(vsync count since E, order-change time), picture constant); seeking = evaluating render(t). Not ported, not classified beyond the phase-1 remarks: fx0-2, 4, 5, 7-12.
## TODO
0. Port the other effects (simplest next: check fx0 logos, fx7), one oracle run per batch of effects.
1. Per-effect analysis (decode textures in DATA.DAT, effect inner loops), then the JS port in web/ (libopenmpt for X14.S3M), reuse stv/web as player shell. Fix the CRTC line-compare.
2. Verify the effect classification (pure vs accumulating) per effect.
