const fs = require('fs');
const path = require('path');

const definitionsPath = path.join(__dirname, 'definitions.json');
const primitivePath = path.join(__dirname, 'primitive.json');
const enumPath = path.join(__dirname, 'enum.json');
const tableCountPath = path.join(__dirname, 'tableCount.json');
const iteratePath = path.join(__dirname, 'iterate.json');

const definitions = JSON.parse(
  fs.readFileSync(definitionsPath, 'utf8')
);

const primitive = JSON.parse(
  fs.readFileSync(primitivePath, 'utf8')
);

const enums = JSON.parse(
  fs.readFileSync(enumPath, 'utf8')
);
const tableCount = JSON.parse(
  fs.readFileSync(tableCountPath, 'utf8')
);
const iterate = JSON.parse(
  fs.readFileSync(iteratePath, 'utf8')
);

const primitiveMap = new Map(
  primitive.map(type => [type.name, type])
);


const input = process.argv[2];
if (!input) {
  throw new Error('Decompressed file path is required.');
}


const data = fs.readFileSync(input);

let offset = 0;
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

function readSaveHeader() {
  const saveVersion = data.readUInt32LE(offset);
  offset += 4;

  // GameDataHash = uint32[4]
  const gameDataHash = [
    data.readUInt32LE(offset),
    data.readUInt32LE(offset + 4),
    data.readUInt32LE(offset + 8),
    data.readUInt32LE(offset + 12)
  ];
  offset += 16;

  const versionLength = data.readUInt32LE(offset);
  offset += 4;

  const version = data
    .subarray(offset, offset + versionLength)
    .toString('utf8');

  offset += versionLength;

  return {
    saveVersion,
    gameDataHash,
    version
  };
}

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

    // m_xxx[i][j] 같은 indexed call
    const indices = [...name.matchAll(/\[([A-Za-z_]\w*)\]/g)]
      .map(m => m[1]);

    if (indices.length > 0) {
      const callType = call.type;

      // CvEnumMap<Enum, T>[i][j]의 최종 원소 타입은 T
      if (typeName(callType) === 'CvEnumMap') {
        let elementType = typeArgs(callType)[1];

        // T* -> T
        if (typeName(elementType).endsWith('*')) {
          elementType = {
            name: typeName(elementType).slice(0, -1).trim(),
            args: typeArgs(elementType)
          };
        }

        const counts = [];

        for (const state of call.state || []) {
          if (state.of !== 'for') continue;

          const value = iterate[state.exp];

          if (value === undefined) {
            throw new Error(
              `Unknown iteration expression '${state.exp}'.`
            );
          }

          const count =
            typeof value === 'number'
              ? value
              : tableCount[value];

          if (count === undefined) {
            throw new Error(
              `Unknown iteration count '${value}'.`
            );
          }

          counts.push(count);
        }

        if (counts.length !== indices.length) {
          throw new Error(
            `Index/state mismatch at '${name}': ` +
            `${indices.length} indices, ${counts.length} loops.`
          );
        }

        // 모든 loop 조합을 생성
        function walkIndices(depth, currentName) {
          if (depth === counts.length) {
            result.push(
              readType(elementType, currentName)
            );
            return;
          }

          for (let i = 0; i < counts[depth]; i++) {
            walkIndices(
              depth + 1,
              `${currentName}[${i}]`
            );
          }
        }

        walkIndices(0, name.replace(/\[[A-Za-z_]\w*\]/g, ''));

        continue;
      }
    }

    const field = call.dimensions?.length
      ? readArray(call.type, call.dimensions, name)
      : readType(call.type, name);

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

function getArrayCount(expr) {
  if (/^\d+$/.test(expr)) {
    return Number(expr);
  }

  if (expr === 'MAX_MAJOR_CIVS') {
    return 22;
  }

  throw new Error(`Unknown array count '${expr}'.`);
}

function readArray(type, dimensions, name, depth = 0) {
  const count = getArrayCount(dimensions[depth]);

  const values = [];

  for (let i = 0; i < count; i++) {
    const childName = `${name}[${i}]`;

    if (depth + 1 < dimensions.length) {
      values.push(
        readArray(type, dimensions, childName, depth + 1)
      );
    } else {
      values.push(
        readType(type, childName)
      );
    }
  }

  return values;
}

function getEnumCount(enumType) {
  // Fixed-count enums
  const fixedCounts = {
    PlayerTypes: 64,
    TeamTypes: 64,
    // 필요해질 때 추가
  };

  if (Object.prototype.hasOwnProperty.call(fixedCounts, enumType)) {
    return fixedCounts[enumType];
  }

  // 기존 DB table 추론
  const candidates = new Set();

  candidates.add(enumType);

  if (enumType.endsWith('Types')) {
    const base = enumType.slice(0, -5);
    candidates.add(base);
    candidates.add(`${base}s`);

    if (base.endsWith('s') ||
    base.endsWith('x') ||
    base.endsWith('z') ||
    base.endsWith('ch') ||
    base.endsWith('sh')) {
      candidates.add(`${base}es`);
    } else if (base.endsWith('y')) {
      candidates.add(`${base.slice(0, -1)}ies`);
    } else {
      candidates.add(`${base}s`);
    }

    candidates.add(`${base}Info`);
    candidates.add(`${base}Infos`);
  }

  if (enumType.endsWith('Type')) {
    const base = enumType.slice(0, -4);
    candidates.add(base);
    candidates.add(`${base}s`);

    if (base.endsWith('y')) {
      candidates.add(`${base.slice(0, -1)}ies`);
    }

    candidates.add(`${base}Info`);
    candidates.add(`${base}Infos`);
  }

  for (const tableName of candidates) {
    if (Object.prototype.hasOwnProperty.call(tableCount, tableName)) {
      const count = tableCount[tableName];

      if (!Number.isInteger(count) || count < 0) {
        throw new Error(
          `Invalid table count for '${tableName}': ${count}`
        );
      }

      return count;
    }
  }

  throw new Error(
    `Cannot resolve DB table for enum '${enumType}'. ` +
    `Tried: ${[...candidates].join(', ')}`
  );
}
function getIterationCount(exp) {
    const value = iterate[exp];

    if (value === undefined) {
        throw new Error(`Unknown iteration expression: ${exp}`);
    }

    if (typeof value === 'number') {
        return value;
    }

    if (typeof value === 'string') {
        const count = tableCount[value];

        if (count === undefined) {
            throw new Error(
                `Unknown table count '${value}' for iteration: ${exp}`
            );
        }

        return count;
    }

    throw new Error(`Invalid iteration value for: ${exp}`);
}

function readCvEnumMap(type, name) {
  const args = typeArgs(type);

  if (args.length < 2) {
    throw new Error(`Invalid CvEnumMap type: ${typeToString(type)}`);
  }

  const enumType = typeName(args[0]);
  const valueType = args[1];

  const count = getEnumCount(enumType);

  const values = [];

  for (let i = 0; i < count; i++) {
    values.push(
      readType(valueType, `${name}[${i}]`)
    );
  }

  return values;
}

function readCvString(name) {
  const start = offset;

  const length = readBytes(4).readUInt32LE(0);
  const raw = readBytes(length);

  return {
    name,
    type: 'CvString',
    offset: start,
    size: 4 + length,
    value: raw.toString('utf8'),
    raw: raw.toString('hex')
  };
}
function readPair(type, name) {
  const args = typeArgs(type);

  if (args.length !== 2) {
    throw new Error(`Invalid std::pair type: ${typeToString(type)}`);
  }

  return [
    readType(args[0], `${name}[0]`),
    readType(args[1], `${name}[1]`)
  ];
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

  // CvString
  if (typeNameValue === 'CvString') {
    return readCvString(name);
  }

  // vector<T>
  if (typeNameValue === 'std::vector'
  || typeNameValue === 'vector') {
    return readVector(type, name);
  }

  // unordered_set<T>
  if (typeNameValue === 'std::tr1::unordered_set') {
    return readUnorderedSet(type, name);
  }

  // pair<T1, T2>
  if (typeNameValue === 'std::pair') {
    return readPair(type, name);
  }
  
  // CvEnumMap<K, V>
  if (typeNameValue === 'CvEnumMap') {
    return readCvEnumMap(type, name);
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

const result = {
  ...readSaveHeader(),
  fields: walkDefinition('CvGame')
};

fs.writeFileSync(
  'parsed.json',
  JSON.stringify(result, null, 2)
);

console.log(`Save Version: ${result.saveVersion}`);
console.log(`Game Data Hash: ${result.gameDataHash.join(', ')}`);
console.log(`Version: ${result.version}`);
console.log(`Read through offset: 0x${offset.toString(16)}`);

if (stopped) {
  console.log('Parsing stopped at unsupported/unknown type.');
}

console.log('Output: parsed.json');

