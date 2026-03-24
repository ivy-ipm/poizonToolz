// Protobuf encoder/decoder for GRAB VR .level format

// ---- Encoder ----

export function encodeVarint(value: number): number[] {
  const bytes: number[] = [];
  value = value >>> 0;
  while (value >= 0x80) {
    bytes.push((value & 0x7f) | 0x80);
    value >>>= 7;
  }
  bytes.push(value & 0x7f);
  return bytes;
}
export function encodeTag(field: number, wire: number) {
  return encodeVarint((field << 3) | wire);
}
export function encodeVarintField(field: number, value: number) {
  return [...encodeTag(field, 0), ...encodeVarint(value)];
}
export function encodeFloat(v: number): number[] {
  const ab = new ArrayBuffer(4);
  new DataView(ab).setFloat32(0, v, true);
  return Array.from(new Uint8Array(ab));
}
export function encodeFloatField(field: number, v: number) {
  return [...encodeTag(field, 5), ...encodeFloat(v)];
}
export function encodeLen(field: number, data: number[]) {
  return [...encodeTag(field, 2), ...encodeVarint(data.length), ...data];
}
export function encodeString(field: number, s: string) {
  const bytes = Array.from(new TextEncoder().encode(s));
  return encodeLen(field, bytes);
}
export function encodeVec3(x: number, y: number, z: number): number[] {
  return [
    ...encodeFloatField(1, x),
    ...encodeFloatField(2, y),
    ...encodeFloatField(3, z),
  ];
}
export function encodeQuat(x: number, y: number, z: number, w: number): number[] {
  return [
    ...encodeFloatField(1, x),
    ...encodeFloatField(2, y),
    ...encodeFloatField(3, z),
    ...encodeFloatField(4, w),
  ];
}

// ---- Decoder ----

function readVarint(buf: Uint8Array, offset: number): [number, number] {
  let result = 0;
  let shift = 0;
  while (offset < buf.length) {
    const byte = buf[offset++];
    result |= (byte & 0x7f) << shift;
    if (!(byte & 0x80)) break;
    shift += 7;
  }
  return [result, offset];
}

function readFloat32(buf: Uint8Array, offset: number): [number, number] {
  const dv = new DataView(buf.buffer, buf.byteOffset + offset, 4);
  return [dv.getFloat32(0, true), offset + 4];
}

function readLenDelim(buf: Uint8Array, offset: number): [Uint8Array, number] {
  const [len, newOffset] = readVarint(buf, offset);
  return [buf.slice(newOffset, newOffset + len), newOffset + len];
}

type ProtoField = { wire: number; value: number | Uint8Array };

function parseRaw(buf: Uint8Array): Record<number, ProtoField[]> {
  const fields: Record<number, ProtoField[]> = {};
  let offset = 0;
  while (offset < buf.length) {
    if (offset >= buf.length) break;
    const [tag, o1] = readVarint(buf, offset);
    offset = o1;
    const fieldNum = tag >> 3;
    const wire = tag & 0x7;
    if (!fields[fieldNum]) fields[fieldNum] = [];
    if (wire === 0) {
      const [v, o2] = readVarint(buf, offset);
      offset = o2;
      fields[fieldNum].push({ wire, value: v });
    } else if (wire === 5) {
      const [v, o2] = readFloat32(buf, offset);
      offset = o2;
      fields[fieldNum].push({ wire, value: v });
    } else if (wire === 2) {
      const [data, o2] = readLenDelim(buf, offset);
      offset = o2;
      fields[fieldNum].push({ wire, value: data });
    } else {
      break;
    }
  }
  return fields;
}

function getVarint(fields: Record<number, ProtoField[]>, fieldNum: number, def = 0): number {
  const arr = fields[fieldNum];
  if (!arr || arr.length === 0) return def;
  return arr[0].value as number;
}

function getString(fields: Record<number, ProtoField[]>, fieldNum: number, def = ""): string {
  const arr = fields[fieldNum];
  if (!arr || arr.length === 0) return def;
  const raw = arr[0].value as Uint8Array;
  try { return new TextDecoder().decode(raw); } catch { return def; }
}

function getBytes(fields: Record<number, ProtoField[]>, fieldNum: number): Uint8Array | null {
  const arr = fields[fieldNum];
  if (!arr || arr.length === 0) return null;
  return arr[0].value as Uint8Array;
}

function getFloat(fields: Record<number, ProtoField[]>, fieldNum: number, def = 0): number {
  const arr = fields[fieldNum];
  if (!arr || arr.length === 0) return def;
  return arr[0].value as number;
}

function parseVec3(buf: Uint8Array): [number, number, number] {
  const f = parseRaw(buf);
  return [getFloat(f, 1), getFloat(f, 2), getFloat(f, 3)];
}

function parseQuat(buf: Uint8Array): [number, number, number, number] {
  const f = parseRaw(buf);
  return [getFloat(f, 1), getFloat(f, 2), getFloat(f, 3), getFloat(f, 4, -1)];
}

// ---- Public types ----

export interface GrabBlock {
  id: string;
  blockType: number;
  variant: number;
  position: [number, number, number];
  scale: [number, number, number];
  rotation: [number, number, number, number];
  color: [number, number, number];
}

export interface GrabLevel {
  formatVersion: number;
  title: string;
  creator: string;
  blocks: GrabBlock[];
}

let _blockId = 0;
function nextId() { return `b${++_blockId}`; }

function parseBlock(blockBuf: Uint8Array): GrabBlock | null {
  try {
    const f = parseRaw(blockBuf);
    const blockType = getVarint(f, 1, 1000);
    const variant = getVarint(f, 2, 0);

    const posBuf = getBytes(f, 3);
    const scaleBuf = getBytes(f, 4);
    const rotBuf = getBytes(f, 5);
    const colorBuf = getBytes(f, 6);

    const position: [number, number, number] = posBuf ? parseVec3(posBuf) : [0, 0, 0];
    const scale: [number, number, number] = scaleBuf ? parseVec3(scaleBuf) : [1, 1, 1];
    const rotation: [number, number, number, number] = rotBuf ? parseQuat(rotBuf) : [0, 0, 0, -1];
    let color: [number, number, number] = [255, 255, 255];
    if (colorBuf) {
      const [r, g, b] = parseVec3(colorBuf);
      color = [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
    }

    return { id: nextId(), blockType, variant, position, scale, rotation, color };
  } catch {
    return null;
  }
}

export function decodeLevel(bytes: Uint8Array): GrabLevel {
  const root = parseRaw(bytes);
  const formatVersion = getVarint(root, 1, 6);
  const title = getString(root, 2, "Untitled");
  const creator = getString(root, 3, "");

  const blocks: GrabBlock[] = [];
  const blockEntries = root[6] || [];
  for (const entry of blockEntries) {
    if (entry.wire !== 2) continue;
    const outerBuf = entry.value as Uint8Array;
    const outer = parseRaw(outerBuf);
    const innerBuf = getBytes(outer, 3);
    if (!innerBuf) continue;
    const block = parseBlock(innerBuf);
    if (block) blocks.push(block);
  }

  return { formatVersion, title, creator, blocks };
}

// ---- Encoder: GrabLevel -> Uint8Array ----

export function encodeBlock(block: GrabBlock): number[] {
  const [px, py, pz] = block.position;
  const [sx, sy, sz] = block.scale;
  const [qx, qy, qz, qw] = block.rotation;
  const [r, g, b] = block.color;

  const inner: number[] = [
    ...encodeVarintField(1, block.blockType),
    ...encodeVarintField(2, block.variant),
    ...encodeLen(3, encodeVec3(px, py, pz)),
    ...encodeLen(4, encodeVec3(sx, sy, sz)),
    ...encodeLen(5, encodeQuat(qx, qy, qz, qw)),
    ...encodeLen(6, encodeVec3(r / 255, g / 255, b / 255)),
  ];
  return encodeLen(6, encodeLen(3, inner));
}

export function encodeLevel(level: GrabLevel): Uint8Array {
  const parts: number[] = [
    ...encodeVarintField(1, level.formatVersion),
    ...encodeString(2, level.title),
    ...encodeString(3, level.creator || "poizonTools"),
    ...encodeVarintField(5, level.blocks.length),
  ];
  for (const block of level.blocks) {
    parts.push(...encodeBlock(block));
  }
  return new Uint8Array(parts);
}

export function newBlock(overrides: Partial<GrabBlock> = {}): GrabBlock {
  return {
    id: nextId(),
    blockType: 1000,
    variant: 8,
    position: [0, 0.5, 0],
    scale: [1, 1, 1],
    rotation: [0, 0, 0, 1],
    color: [100, 180, 255],
    ...overrides,
  };
}

export function newLevel(): GrabLevel {
  return {
    formatVersion: 6,
    title: "New Level",
    creator: "poizonTools",
    blocks: [],
  };
}

// Encode the start checkpoint at a given Z position
// Format verified against real GRAB level binary: field6 → field1 → {pos, rot, flag}
function encodeStartCheckpoint(z: number): number[] {
  const inner: number[] = [
    ...encodeLen(1, encodeFloatField(3, z)),        // position z
    ...encodeLen(2, encodeFloatField(4, 1.0)),       // rotation w
    ...encodeFloatField(3, 1.0),                     // required flag
  ];
  return encodeLen(6, encodeLen(1, inner));
}

// Encode the finish ring at a given Z position
// Format verified against real GRAB level binary: field6 → field2 → {pos, flag}
function encodeFinishRing(z: number): number[] {
  const inner: number[] = [
    ...encodeLen(1, encodeFloatField(3, z)),         // position z
    ...encodeFloatField(2, 1.0),                     // required flag
  ];
  return encodeLen(6, encodeLen(2, inner));
}

export function levelToJson(level: GrabLevel): string {
  return JSON.stringify(level, null, 2);
}

export function jsonToLevel(json: string): GrabLevel {
  const parsed = JSON.parse(json);
  return {
    formatVersion: parsed.formatVersion ?? 6,
    title: parsed.title ?? "Untitled",
    creator: parsed.creator ?? "",
    blocks: (parsed.blocks ?? []).map((b: Partial<GrabBlock>) => ({
      id: b.id ?? nextId(),
      blockType: b.blockType ?? 1000,
      variant: b.variant ?? 8,
      position: b.position ?? [0, 0.5, 0],
      scale: b.scale ?? [1, 1, 1],
      rotation: b.rotation ?? [0, 0, 0, -1],
      color: b.color ?? [255, 255, 255],
    })),
  };
}
