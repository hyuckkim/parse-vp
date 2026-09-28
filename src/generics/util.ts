import { readFileSync } from "fs";
import { primitiveMap } from "../walk.js";
import { type DefinitionType } from '../magicnumber.js';

export let offset = 0;
export let stopped = false;
export let data: Buffer;
export function Init(input: string) {
  offset = 0;
  stopped = false;
  data = readFileSync(input);
}
export function readBytes(size: number) {
  if (offset + size > data.length) {
    throw new Error(
        `Unexpected end of data at offset 0x${offset.toString(16)}. required size was ${size}.`
    );
  }

  const value = data.subarray(offset, offset + size);
  offset += size;

  return value;
}
export function readString() {
    const length = readBytes(4).readUInt32LE(0);
    const value = readBytes(length).toString('utf8');
    return value;
}
export function Stop(err?: string) {
    if (err) {
        console.log(err);
    } else {
        console.log(`Stopped at offset 0x${offset.toString(16)} (${readBytes(4).toString('hex')})`);
    }
    stopped = true;
    return null;
}

export function readContainerCount() {
  const info = primitiveMap.get('size_t');

  if (!info) {
    throw new Error('primitive.json must contain size_t');
  }

  const fieldOffset = offset;
  const raw = readBytes(info.size);

  if (info.size !== 4) {
    throw new Error(
      `Unexpected size_t size: ${info.size}`
    );
  }

  return {
    offset: fieldOffset,
    size: info.size,
    count: raw.readUInt32LE(0),
    data: raw.toString('hex')
  };
}

export function typeArgs(type: DefinitionType | string): any[] {
  if (!type || typeof type !== 'object') {
    return [];
  }

  return Array.isArray(type.args) ? type.args : [];
}
export function typeToString(type: DefinitionType): string {
  if (!type) {
    return '<null>';
  }

  const name = typeName(type);

  if (!name) {
    return '<unknown>';
  }

  const args = typeArgs(type);

  if (args.length === 0) {
    return name;
  }

  return `${name}<${args.map(typeToString).join(', ')}>`;
}
export function typeName(type: DefinitionType): string | null {
  if (!type) {
    return null;
  }

  if (typeof type === 'string') {
    return type;
  }

  if (typeof type === 'object' && typeof type.name === 'string') {
    return type.name;
  }

  return null;
}
