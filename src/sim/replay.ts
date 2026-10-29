// Replay format (version 1, frozen: existing recordings must always decode and replay the same).
//
// A replay records every stepWorld call from world creation, countdown included. For each tick and
// each car (car-major within a tick) it stores two bytes:
//   byte 0: steer as int8 two's complement, round(steer * 127), range −127..127
//   byte 1: flags; bit0 throttle, bit1 brake, bit2 reserved for a future action button (0 today)
// The bytes are base64-encoded (standard alphabet, with padding) inside a JSON envelope:
//   { "version": 1, "track": "<track id>", "seed": n, "carCount": n, "ticks": n, "inputs": "<base64>" }
import type { CarInput, CarView, TrackData } from './types.ts';
import { carViews, createWorld, steerToInt8, stepWorld } from './world.ts';

export interface Replay {
  version: 1;
  /** Track id. */
  track: string;
  seed: number;
  carCount: number;
  ticks: number;
  /** Base64 of ticks × carCount × 2 bytes (see the file header). */
  inputs: string;
}

const FLAG_THROTTLE = 1;
const FLAG_BRAKE = 2;
const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/** Standard base64 with padding. Implemented here so it works the same in browsers and Node. */
export function bytesToBase64(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i] as number;
    const b = i + 1 < bytes.length ? (bytes[i + 1] as number) : 0;
    const c = i + 2 < bytes.length ? (bytes[i + 2] as number) : 0;
    const n = (a << 16) | (b << 8) | c;
    out += B64[(n >> 18) & 63];
    out += B64[(n >> 12) & 63];
    out += i + 1 < bytes.length ? B64[(n >> 6) & 63] : '=';
    out += i + 2 < bytes.length ? B64[n & 63] : '=';
  }
  return out;
}

/** Inverse of bytesToBase64. Throws on characters outside the alphabet or a bad length. */
export function base64ToBytes(text: string): Uint8Array {
  if (text.length % 4 !== 0) throw new Error('base64: length must be a multiple of 4');
  const pad = text.endsWith('==') ? 2 : text.endsWith('=') ? 1 : 0;
  const out = new Uint8Array((text.length / 4) * 3 - pad);
  let o = 0;
  for (let i = 0; i < text.length; i += 4) {
    let n = 0;
    for (let k = 0; k < 4; k++) {
      const ch = text[i + k] as string;
      const v = ch === '=' && i + k >= text.length - pad ? 0 : B64.indexOf(ch);
      if (v < 0) throw new Error(`base64: invalid character "${ch}"`);
      n = (n << 6) | v;
    }
    if (o < out.length) out[o++] = (n >> 16) & 255;
    if (o < out.length) out[o++] = (n >> 8) & 255;
    if (o < out.length) out[o++] = n & 255;
  }
  return out;
}

/** Packs per-tick inputs (frames[tick][car]) into the base64 byte string. Missing = no input. */
export function encodeInputs(frames: readonly (readonly CarInput[])[], carCount: number): string {
  const bytes = new Uint8Array(frames.length * carCount * 2);
  frames.forEach((frame, t) => {
    for (let c = 0; c < carCount; c++) {
      const input = frame[c];
      const at = (t * carCount + c) * 2;
      if (input === undefined) continue;
      bytes[at] = steerToInt8(input.steer) & 255;
      bytes[at + 1] = (input.throttle ? FLAG_THROTTLE : 0) | (input.brake ? FLAG_BRAKE : 0);
    }
  });
  return bytesToBase64(bytes);
}

/** Unpacks the base64 byte string into frames[tick][car]. Steer comes back as int8 / 127. */
export function decodeInputs(text: string, ticks: number, carCount: number): CarInput[][] {
  const bytes = base64ToBytes(text);
  if (bytes.length !== ticks * carCount * 2) {
    throw new Error(`replay: expected ${ticks * carCount * 2} input bytes, got ${bytes.length}`);
  }
  const frames: CarInput[][] = [];
  for (let t = 0; t < ticks; t++) {
    const frame: CarInput[] = [];
    for (let c = 0; c < carCount; c++) {
      const at = (t * carCount + c) * 2;
      const raw = bytes[at] as number;
      const flags = bytes[at + 1] as number;
      const steer = (raw > 127 ? raw - 256 : raw) / 127;
      frame.push({ steer, throttle: (flags & FLAG_THROTTLE) !== 0, brake: (flags & FLAG_BRAKE) !== 0 });
    }
    frames.push(frame);
  }
  return frames;
}

/** Builds a replay from the inputs fed to stepWorld, one frame per tick since world creation. */
export function createReplay(
  trackId: string,
  seed: number,
  carCount: number,
  frames: readonly (readonly CarInput[])[],
): Replay {
  return { version: 1, track: trackId, seed, carCount, ticks: frames.length, inputs: encodeInputs(frames, carCount) };
}

/** Serialises a replay to its JSON envelope (key order as createReplay/decodeReplay build it). */
export function encodeReplay(replay: Replay): string {
  return JSON.stringify(replay);
}

/** Parses and checks a replay JSON envelope. Throws on anything malformed. */
export function decodeReplay(json: string): Replay {
  const v: unknown = JSON.parse(json);
  if (typeof v !== 'object' || v === null) throw new Error('replay: expected an object');
  const o = v as Record<string, unknown>;
  if (o['version'] !== 1) throw new Error('replay: unsupported version');
  const { track, seed, carCount, ticks, inputs } = o;
  if (typeof track !== 'string') throw new Error('replay: track must be a string');
  if (typeof seed !== 'number' || !Number.isFinite(seed)) throw new Error('replay: seed must be a number');
  if (!Number.isInteger(carCount) || (carCount as number) < 1) throw new Error('replay: bad carCount');
  if (!Number.isInteger(ticks) || (ticks as number) < 0) throw new Error('replay: bad ticks');
  if (typeof inputs !== 'string') throw new Error('replay: inputs must be a string');
  const replay: Replay = { version: 1, track, seed, carCount: carCount as number, ticks: ticks as number, inputs };
  decodeInputs(inputs, replay.ticks, replay.carCount); // validates the payload length
  return replay;
}

/** Frames of a replay, frames[tick][car]. */
export function replayInputs(replay: Replay): CarInput[][] {
  return decodeInputs(replay.inputs, replay.ticks, replay.carCount);
}

/** Runs a replay from a fresh world and returns the final car views. */
export function runReplay(track: TrackData, replay: Replay): CarView[] {
  if (track.id !== replay.track) throw new Error(`replay: recorded on "${replay.track}", not "${track.id}"`);
  const world = createWorld(track, { seed: replay.seed, carCount: replay.carCount });
  for (const frame of replayInputs(replay)) stepWorld(world, frame);
  return carViews(world);
}
