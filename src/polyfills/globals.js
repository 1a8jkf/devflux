import { Buffer } from 'buffer';
import { TextEncoder, TextDecoder } from 'text-encoding';

global.Buffer = global.Buffer || Buffer;
global.TextEncoder = global.TextEncoder || TextEncoder;
global.TextDecoder = global.TextDecoder || TextDecoder;
global.process = global.process || {};
global.process.env = global.process.env || {};
global.process.version = global.process.version || 'v14.17.0';
global.process.nextTick = global.process.nextTick || setImmediate;
