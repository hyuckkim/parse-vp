const fs = require('fs');
const path = require('path');

const definitionsPath = path.join(__dirname, 'definitions.json');
const primitivePath = path.join(__dirname, 'primitive.json');
const enumPath = path.join(__dirname, 'enum.json');

const definitions = JSON.parse(
  fs.readFileSync(definitionsPath, 'utf8')
);

const primitive = JSON.parse(
  fs.readFileSync(primitivePath, 'utf8')
);

const enums = JSON.parse(
  fs.readFileSync(enumPath, 'utf8')
);

const primitiveMap = new Map(
  primitive.map(type => [type.name, type])
);

const input = process.argv[2];
const startOffset = Number(process.argv[3] ?? 0);

if (!input) {
  throw new Error('Decompressed file path is required.');
}

if (!Number.isInteger(startOffset) || startOffset < 0) {
  throw new Error('Start offset must be a non-negative integer.');
}

const data = fs.readFileSync(input);

let offset = startOffset;
let stopped = false;


/*
 * ------------------------------------------------------------
 * Type helpers
 * ------------------------------------------------------------
 *
 * New definitions.json stores types as:
 *
 * {
 *   "name": "CvEnumMap",
 *   "args": [
 *     { "name": "PlayerTypes", "args": [] },
 *     { "name": "int", "args": [] }
 *   ]
 * }
 *
 * instead of:
 *
 * "CvEnumMap"
 */

function typeName(type) {
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

function typeArgs(type) {
  if (!type || typeof type !== 'object') {
    return [];
  }

  return Array.isArray(type.args) ? type.args : [];
}

function typeToString(type) {
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


/*
 * ------------------------------------------------------------
 * Enum reverse lookup
 * ------------------------------------------------------------
 */

const enumReverse = new Map();

for (const [enumType, values] of Object.entries(enums)) {
  const reverse = new Map();

  for (const [name, value] of Object.entries(values)) {
    reverse.set(value, name);
  }

  enumReverse.set(enumType, reverse);
}


/*
 * ------------------------------------------------------------
 * Binary reader
 * ------------------------------------------------------------
 */

function readBytes(size) {
  if (offset + size > data.length) {
    throw new Error(
      `Unexpected end of data at offset 0x${offset.toString(16)}.`
    );
  }

  const value = data.subarray(offset, offset + size);
  offset += size;

  return value;
}


/*
 * ------------------------------------------------------------
 * Title
 * ------------------------------------------------------------
 */

function readTitle() {
  const length = readBytes(4).readUInt32LE(0);
  const value = readBytes(length);

  return value.toString('utf8').replace(/\0+$/, '');
}


/*
 * ------------------------------------------------------------
 * Primitive
 * ------------------------------------------------------------
 */

function readPrimitive(type, name) {
  const info = primitiveMap.get(type);

  if (!info || typeof info.size !== 'number') {
    console.log(
      `Unknown primitive type '${type}' at field '${name}'.`
    );

    stopped = true;
    return null;
  }

  const fieldOffset = offset;
  const value = readBytes(info.size);

  return {
    name,
    type,
    offset: fieldOffset,
    size: info.size,
    data: value.toString('hex')
  };
}


/*
 * ------------------------------------------------------------
 * Enum
 * ------------------------------------------------------------
 */

function readEnum(type, name) {
  const primitiveInfo = primitiveMap.get('int');

  if (!primitiveInfo) {
    throw new Error('primitive.json must contain int');
  }

  const fieldOffset = offset;
  const raw = readBytes(primitiveInfo.size);
  const value = raw.readInt32LE(0);

  const reverse = enumReverse.get(type);

  const enumName =
    reverse?.get(value) ?? null;

  return {
    name,
    type,
    offset: fieldOffset,
    size: primitiveInfo.size,
    value,
    enumName,
    raw: raw.toString('hex')
  };
}


/*
 * ------------------------------------------------------------
 * Definition walker
 * ------------------------------------------------------------
 */

function walkDefinition(type) {
  const definition = definitions[type];

  if (!definition) {
    return null;
  }

  const result = [];

  for (const call of definition.calls) {
    if (stopped) break;

    const name = call.name || call.call;

    if (!call.type) {
      console.log(`Unknown/null type at field '${name}'.`);
      stopped = true;
      break;
    }

    const field = readType(call.type, name);

    if (field === null) {
      break;
    }

    result.push(field);
  }

  return result;
}

function typeName(type) {
  if (!type) return null;
  if (typeof type === 'string') return type;

  if (
    typeof type === 'object' &&
    typeof type.name === 'string'
  ) {
    return type.name;
  }

  return null;
}

function typeArgs(type) {
  if (!type || typeof type !== 'object') {
    return [];
  }

  return Array.isArray(type.args) ? type.args : [];
}

function typeToString(type) {
  const name = typeName(type);
  if (!name) return '<unknown>';

  const args = typeArgs(type);

  if (args.length === 0) {
    return name;
  }

  return `${name}<${args.map(typeToString).join(', ')}>`;
}
function readContainerCount() {
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
    raw: raw.toString('hex')
  };
}
function readVector(type, name) {
  const args = typeArgs(type);

  if (args.length !== 1) {
    throw new Error(
      `Invalid vector type: ${typeToString(type)}`
    );
  }

  const elementType = args[0];
  const countInfo = readContainerCount();

  const elements = [];

  for (let i = 0; i < countInfo.count; ++i) {
    const element = readType(
      elementType,
      `[${i}]`
    );

    if (element === null) {
      break;
    }

    elements.push(element);
  }

  return {
    name,
    type: typeToString(type),
    offset: countInfo.offset,
    size: offset - countInfo.offset,
    count: countInfo.count,
    elements
  };
}
function readUnorderedSet(type, name) {
  const args = typeArgs(type);

  if (args.length !== 1) {
    throw new Error(
      `Invalid unordered_set type: ${typeToString(type)}`
    );
  }

  const elementType = args[0];
  const countInfo = readContainerCount();

  const elements = [];

  for (let i = 0; i < countInfo.count; ++i) {
    const element = readType(
      elementType,
      `[${i}]`
    );

    if (element === null) {
      break;
    }

    elements.push(element);
  }

  return {
    name,
    type: typeToString(type),
    offset: countInfo.offset,
    size: offset - countInfo.offset,
    count: countInfo.count,
    elements
  };
}

function readType(type, name) {
  const typeNameValue = typeName(type);

  if (!typeNameValue) {
    console.log(`Unknown type at '${name}'.`);
    stopped = true;
    return null;
  }

  // primitive
  if (primitiveMap.has(typeNameValue)) {
    return readPrimitive(typeNameValue, name);
  }

  // enum
  if (enums[typeNameValue]) {
    return readEnum(typeNameValue, name);
  }

  // vector<T>
  if (typeNameValue === 'std::vector') {
    return readVector(type, name);
  }

  // unordered_set<T>
  if (typeNameValue === 'std::tr1::unordered_set') {
    return readUnorderedSet(type, name);
  }

  // nested definition
  if (definitions[typeNameValue]) {
    const fieldOffset = offset;

    const fields = walkDefinition(typeNameValue);

    return {
      name,
      type: typeNameValue,
      offset: fieldOffset,
      size: offset - fieldOffset,
      fields
    };
  }

  console.log(
    `Unsupported type '${typeToString(type)}' at field '${name}'.`
  );

  stopped = true;
  return null;
}


/*
 * ------------------------------------------------------------
 * Main
 * ------------------------------------------------------------
 */


const title = readTitle();

const result = {
  title,
  fields: walkDefinition('CvGame')
};

fs.writeFileSync(
  'parsed.json',
  JSON.stringify(result, null, 2)
);

console.log(`Title: ${title}`);
console.log(`Read through offset: 0x${offset.toString(16)}`);

if (stopped) {
  console.log('Parsing stopped at unsupported/unknown type.');
}

console.log('Output: parsed.json');

