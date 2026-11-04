import QRCode from "qrcode";

/** SVG string for a QR code (error correction H so a logo can sit in the middle). */
export async function qrSvg(text: string, opts: { size?: number; color?: string; margin?: number; level?: "L" | "M" | "Q" | "H" } = {}) {
  return QRCode.toString(text, { type: "svg", errorCorrectionLevel: opts.level ?? "H", margin: opts.margin ?? 1, width: opts.size ?? 320, color: { dark: opts.color ?? "#329537", light: "#FFFFFF" } });
}

/**
 * QR for a printed staff label: black modules (thermal and laser printers alike), no built-in quiet
 * zone (the label's own padding provides it), sized by its container. Error correction M survives a crease.
 */
export async function qrLabelSvg(text: string) {
  const svg = await qrSvg(text, { color: "#000000", margin: 0, level: "M" });
  return svg.replace(/\s(width|height)="[^"]*"/g, "").replace("<svg ", '<svg aria-hidden="true" focusable="false" ');
}

/** PNG data URL (for downloads / print). */
export async function qrPngDataUrl(text: string, size = 1024) {
  return QRCode.toDataURL(text, { errorCorrectionLevel: "H", margin: 2, width: size, color: { dark: "#329537", light: "#FFFFFF" } });
}
