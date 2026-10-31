// Test helper: swaps the real Circle App Kit loader (src/lib/appkit-sdk.ts) for a scripted stub, so page tests
// never download the SDK or call Circle. The stub is controlled through window.__akStub from the test.
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));

export const appKitStub = {
  name: 'appkit-sdk-stub',
  setup(build) {
    build.onResolve({ filter: /lib\/appkit-sdk$/ }, () => ({ path: path.join(HERE, 'appkit-sdk.stub.js') }));
  },
};
