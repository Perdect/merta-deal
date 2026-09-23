// Generates PWA PNG icons (192/512/maskable) without native image libraries: rasterizes the logo mark to a PNG via zlib.
import { writeFileSync } from "node:fs";
import { deflateSync } from "node:zlib";

function png(width, height, draw) {
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0;
    for (let x = 0; x < width; x++) { const [r, g, b, a] = draw(x, y); const i = y * (width * 4 + 1) + 1 + x * 4; raw[i] = r; raw[i + 1] = g; raw[i + 2] = b; raw[i + 3] = a; }
  }
  const crcTable = []; for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; crcTable[n] = c >>> 0; }
  const crc = (buf) => { let c = 0xffffffff; for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4); ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}

// Geometry in a 64x64 design space (same as icon.svg): rounded square, "M" strokes, "D" arc, saffron dot.
function dist(px, py, ax, ay, bx, by) { const dx = bx - ax, dy = by - ay; const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy || 1))); return Math.hypot(px - (ax + t * dx), py - (ay + t * dy)); }
function drawIcon(size, maskable) {
  const green = [11, 110, 79], white = [255, 255, 255], saffron = [242, 169, 59];
  const pad = maskable ? 0.1 : 0; // maskable icons keep content inside the safe zone
  return png(size, size, (x, y) => {
    const u = ((x + 0.5) / size) * 64, v = ((y + 0.5) / size) * 64;
    // background: rounded square (or full bleed for maskable)
    const r = 16, inset = maskable ? -20 : 0;
    const cx = Math.max(inset + r, Math.min(64 - inset - r, u)), cy = Math.max(inset + r, Math.min(64 - inset - r, v));
    const inside = maskable || Math.hypot(u - cx, v - cy) <= r;
    if (!inside) return [0, 0, 0, 0];
    const s = 1 - pad * 2, ox = 32 - 32 * s, oy = ox; const gu = (u - ox) / s, gv = (v - oy) / s;
    const w = 2.6;
    const mStrokes = [[15, 45, 15, 21], [15, 21, 23, 33], [23, 33, 31, 21], [31, 21, 31, 45]];
    for (const [ax, ay, bx, by] of mStrokes) if (dist(gu, gv, ax, ay, bx, by) <= w) return [...white, 255];
    // D: stem + top/bottom stubs + right half-circle bowl (centre 43,33 radius 12)
    if (dist(gu, gv, 38, 45, 38, 21) <= w || dist(gu, gv, 38, 21, 43, 21) <= w || dist(gu, gv, 38, 45, 43, 45) <= w) return [...white, 255];
    if (gu >= 43 && Math.abs(Math.hypot(gu - 43, gv - 33) - 12) <= w) return [...white, 255];
    if (Math.hypot(gu - 54, gv - 12) <= 4.5) return [...saffron, 255];
    return [...green, 255];
  });
}
writeFileSync("public/icons/icon-192.png", drawIcon(192, false));
writeFileSync("public/icons/icon-512.png", drawIcon(512, false));
writeFileSync("public/icons/icon-maskable-512.png", drawIcon(512, true));
writeFileSync("public/icons/apple-touch-icon.png", drawIcon(180, true));
console.log("icons written");
