// The original app was one classic <script>, so every top-level function/const was a global
// that inline HTML handlers (onclick="...") and other sections could reach. ES modules are
// scoped, so each section publishes its top-level names on globalThis to keep that behavior.
export function publish(map) {
  for (const [key, value] of Object.entries(map)) {
    try {
      Object.defineProperty(globalThis, key, { value, writable: true, configurable: true, enumerable: true });
    } catch (err) {
      console.warn('[ArcLance] could not publish global', key, err);
    }
  }
}
