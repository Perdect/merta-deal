"use client";
import * as React from "react";

export type ScannerStatus = "idle" | "starting" | "running" | "denied" | "unavailable" | "error";

type NativeDetector = { detect: (source: CanvasImageSource) => Promise<{ rawValue: string }[]> };
type Decoder = (video: HTMLVideoElement) => Promise<string | null>;

const NATIVE_FORMATS = ["qr_code", "ean_13", "ean_8", "upc_a", "upc_e", "code_128"];
const FRAME_MS = 140;
/** A code must leave the camera this long before it counts again, so one held label is one scan. */
const REARM_MS = 1500;

/** Native BarcodeDetector where the browser has it (Chrome on Android); ZXing otherwise (iPhone Safari), loaded only then. */
async function createDecoder(): Promise<Decoder> {
  const Native = (globalThis as unknown as { BarcodeDetector?: { new (o: { formats: string[] }): NativeDetector; getSupportedFormats?: () => Promise<string[]> } }).BarcodeDetector;
  if (Native) {
    try {
      const supported = (await Native.getSupportedFormats?.()) ?? NATIVE_FORMATS;
      if (supported.includes("qr_code")) {
        const detector = new Native({ formats: NATIVE_FORMATS.filter((f) => supported.includes(f)) });
        return async (video) => (await detector.detect(video))[0]?.rawValue ?? null;
      }
    } catch { /* fall through to ZXing */ }
  }
  const Z = await import("@zxing/library");
  const reader = new Z.MultiFormatReader();
  const hints = new Map();
  hints.set(Z.DecodeHintType.POSSIBLE_FORMATS, [Z.BarcodeFormat.QR_CODE, Z.BarcodeFormat.EAN_13, Z.BarcodeFormat.EAN_8, Z.BarcodeFormat.UPC_A, Z.BarcodeFormat.UPC_E, Z.BarcodeFormat.CODE_128]);
  reader.setHints(hints);
  const canvas = document.createElement("canvas");
  return async (video) => {
    if (!video.videoWidth) return null;
    const scale = Math.min(1, 720 / video.videoWidth);
    canvas.width = Math.round(video.videoWidth * scale);
    canvas.height = Math.round(video.videoHeight * scale);
    canvas.getContext("2d", { willReadFrequently: true })?.drawImage(video, 0, 0, canvas.width, canvas.height);
    try {
      return reader.decode(new Z.BinaryBitmap(new Z.HybridBinarizer(new Z.HTMLCanvasElementLuminanceSource(canvas)))).getText();
    } catch { return null; } finally { reader.reset(); }
  };
}

/** Continuous camera scanning. Calls onCode once per label; the camera stops when `active` is false or the page is hidden. */
export function useScanner(active: boolean, onCode: (code: string) => void) {
  const videoRef = React.useRef<HTMLVideoElement>(null);
  const streamRef = React.useRef<MediaStream | null>(null);
  const onCodeRef = React.useRef(onCode);
  React.useEffect(() => { onCodeRef.current = onCode; });

  const [status, setRawStatus] = React.useState<ScannerStatus>("idle");
  const [cameras, setCameras] = React.useState<MediaDeviceInfo[]>([]);
  const [deviceId, setDeviceId] = React.useState<string | null>(null);
  const [torchSupported, setTorchSupported] = React.useState(false);
  const [torchOn, setTorchOn] = React.useState(false);
  const [hidden, setHidden] = React.useState(false);

  React.useEffect(() => {
    const onVisibility = () => setHidden(document.hidden);
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  const on = active && !hidden;
  React.useEffect(() => {
    if (!on) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const setStatus = (s: ScannerStatus) => { if (!stopped) setRawStatus(s); };

    (async () => {
      await Promise.resolve(); // state updates below happen after the effect body, not inside it
      if (stopped) return;
      if (!navigator.mediaDevices?.getUserMedia) { setStatus("unavailable"); return; }
      setStatus("starting");
      setTorchOn(false);
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: deviceId ? { deviceId: { exact: deviceId }, width: { ideal: 1280 }, height: { ideal: 720 } } : { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } },
        });
      } catch (e) {
        if (stopped) return;
        const name = (e as DOMException).name;
        setStatus(name === "NotAllowedError" || name === "SecurityError" ? "denied" : name === "NotFoundError" || name === "OverconstrainedError" ? "unavailable" : "error");
        return;
      }
      if (stopped) { stream.getTracks().forEach((t) => t.stop()); return; }
      streamRef.current = stream;
      const video = videoRef.current;
      if (!video) return;
      video.srcObject = stream;
      await video.play().catch(() => undefined);
      const track = stream.getVideoTracks()[0];
      setTorchSupported(Boolean((track?.getCapabilities?.() as { torch?: boolean } | undefined)?.torch));
      // Labels are only available once permission is granted.
      navigator.mediaDevices.enumerateDevices().then((d) => { if (!stopped) setCameras(d.filter((x) => x.kind === "videoinput")); }).catch(() => undefined);

      let decode: Decoder;
      try { decode = await createDecoder(); } catch { if (!stopped) setStatus("error"); return; }
      if (stopped) return;
      setStatus("running");

      let candidate: string | null = null; let accepted: string | null = null; let lastSeen = 0;
      const tick = async () => {
        if (stopped) return;
        const code = await decode(video).catch(() => null);
        if (stopped) return;
        const now = Date.now();
        if (code) {
          // Same value on two frames in a row, which filters misreads on curved packets.
          if (code === candidate) {
            if (code !== accepted || now - lastSeen > REARM_MS) { accepted = code; onCodeRef.current(code); }
            if (code === accepted) lastSeen = now;
          }
          candidate = code;
        } else candidate = null;
        timer = setTimeout(tick, FRAME_MS);
      };
      tick();
    })();

    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, [on, deviceId]);

  const switchCamera = React.useCallback(() => {
    if (cameras.length < 2) return;
    const currentId = streamRef.current?.getVideoTracks()[0]?.getSettings().deviceId ?? deviceId;
    const at = cameras.findIndex((c) => c.deviceId === currentId);
    setDeviceId(cameras[(at + 1) % cameras.length].deviceId);
  }, [cameras, deviceId]);

  const toggleTorch = React.useCallback(async () => {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track) return;
    const next = !torchOn;
    try { await track.applyConstraints({ advanced: [{ torch: next } as MediaTrackConstraintSet] }); setTorchOn(next); } catch { setTorchSupported(false); }
  }, [torchOn]);

  return { videoRef, status: on ? status : "idle", canSwitch: cameras.length > 1, switchCamera, torchSupported, torchOn, toggleTorch };
}

/** Short tone and buzz, because a packer is looking at the bag and not the screen. */
export function scanFeedback(good: boolean) {
  try {
    navigator.vibrate?.(good ? 40 : [80, 60, 80]);
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx(); const osc = ctx.createOscillator(); const gain = ctx.createGain();
    osc.frequency.value = good ? 1046 : 220; gain.gain.value = 0.06;
    osc.connect(gain).connect(ctx.destination); osc.start(); osc.stop(ctx.currentTime + (good ? 0.09 : 0.25));
    osc.onended = () => void ctx.close();
  } catch { /* sound is a courtesy */ }
}
