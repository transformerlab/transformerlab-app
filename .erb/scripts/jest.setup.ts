// jsdom doesn't expose TextEncoder/TextDecoder, but react-router-dom 7 and
// @testing-library/jest-dom 6 reach for them at import time. Polyfill from
// Node's `util` so tests can load those modules under jsdom.
import { TextDecoder, TextEncoder } from 'util';

if (typeof global.TextEncoder === 'undefined') {
  global.TextEncoder = TextEncoder;
}
if (typeof global.TextDecoder === 'undefined') {
  // Node's util.TextDecoder typing differs slightly from the DOM lib, so cast.
  global.TextDecoder = TextDecoder as unknown as typeof global.TextDecoder;
}
