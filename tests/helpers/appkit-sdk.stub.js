// Scripted stand-in for src/lib/appkit-sdk.ts. Set window.__akStub = { estimate, estimateError, swap, swapError, delay } in a test.
const stub = () => (globalThis.__akStub ||= { calls: { estimate: [], swap: [] } });

export async function estimateWithAppKit(provider, r) {
  const s = stub(); (s.calls ||= { estimate: [], swap: [] }).estimate.push(r);
  if (s.delay) await s.delay(r);
  if (s.estimateError) throw s.estimateError;
  return typeof s.estimate === 'function' ? s.estimate(r) : s.estimate;
}

export async function swapWithAppKit(provider, r) {
  const s = stub(); (s.calls ||= { estimate: [], swap: [] }).swap.push(r);
  if (s.swapDelay) await s.swapDelay(r);
  if (s.swapError) throw s.swapError;
  return typeof s.swap === 'function' ? s.swap(r) : s.swap;
}
