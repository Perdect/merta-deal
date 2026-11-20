// Admin app icons: the logo mark from public/icon.svg (white cart, saffron bolt) on the admin blue
// instead of the shop green, so the two installed apps are told apart on a home screen at a glance.
// Run from anywhere:  node scripts/make-admin-icons.mjs
import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const OUT = join(dirname(fileURLToPath(import.meta.url)), "..", "public", "icons");
const BLUE = "#1d4ed8"; // admin theme colour (.theme-admin, admin.webmanifest)

// The mark exactly as drawn in public/icon.svg, in its 64 x 64 design space.
const MARK = `<g transform="translate(0 -2.5)"><path d="M12 18h6l5 22h22l5-16H21" fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/><circle cx="26" cy="48" r="3.5" fill="#fff"/><circle cx="42" cy="48" r="3.5" fill="#fff"/><path d="M37 25l-6.5 9h5.5l-3 7.5 7.5-9.5h-5.5z" fill="#F2A93B"/></g>`;

/**
 * rounded: a tile with round corners and transparent outside (purpose "any").
 * Otherwise the blue fills the whole square and the mark is scaled about the centre, because the
 * platform cuts its own shape out of it: a maskable icon may be cropped to a circle 80% of the width,
 * so at 0.72 (the shop icon's proportion) the mark's farthest point sits about 32% from the centre,
 * inside that 40% radius.
 */
function svg(size, { rounded, scale }) {
  const tile = rounded ? `<rect width="64" height="64" rx="16" fill="${BLUE}"/>` : `<rect width="64" height="64" fill="${BLUE}"/>`;
  const mark = scale === 1 ? MARK : `<g transform="translate(32 32) scale(${scale}) translate(-32 -32)">${MARK}</g>`;
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 64 64">${tile}${mark}</svg>`);
}

const ICONS = [
  { file: "admin-192.png", size: 192, rounded: true, scale: 1 },
  { file: "admin-512.png", size: 512, rounded: true, scale: 1 },
  { file: "admin-maskable-512.png", size: 512, rounded: false, scale: 0.72 },
  // iOS rounds the corners itself and paints transparency black, so this one is a full, opaque square.
  { file: "admin-apple-touch-icon.png", size: 180, rounded: false, scale: 0.8, opaque: true },
];

await mkdir(OUT, { recursive: true });
for (const { file, size, opaque, ...shape } of ICONS) {
  let img = sharp(svg(size, shape)).resize(size, size);
  if (opaque) img = img.flatten({ background: BLUE });
  const info = await img.png({ compressionLevel: 9 }).toFile(join(OUT, file));
  console.log(`${file}  ${info.width}x${info.height}  ${info.size} bytes`);
}
