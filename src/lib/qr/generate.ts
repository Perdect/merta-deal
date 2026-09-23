import QRCode from "qrcode";

/** SVG string for a QR code (error correction H so a logo can sit in the middle). */
export async function qrSvg(text: string, opts: { size?: number; color?: string; margin?: number } = {}) {
  return QRCode.toString(text, { type: "svg", errorCorrectionLevel: "H", margin: opts.margin ?? 1, width: opts.size ?? 320, color: { dark: opts.color ?? "#0B6E4F", light: "#FFFFFF" } });
}

/** PNG data URL (for downloads / print). */
export async function qrPngDataUrl(text: string, size = 1024) {
  return QRCode.toDataURL(text, { errorCorrectionLevel: "H", margin: 2, width: size, color: { dark: "#0B6E4F", light: "#FFFFFF" } });
}
