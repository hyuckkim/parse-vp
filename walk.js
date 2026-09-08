const fs = require('fs');
const path = require('path');

const definitionsPath = path.join(__dirname, 'definitions.json');
const primitivePath = path.join(__dirname, 'primitive.json');

const definitions = JSON.parse(
  fs.readFileSync(definitionsPath, 'utf8')
);

const primitive = JSON.parse(
  fs.readFileSync(primitivePath, 'utf8')
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

function readTitle() {
  const length = readBytes(4).readUInt32LE(0);
  const value = readBytes(length);

  return value.toString('utf8').replace(/\0+$/, '');
}

function readPrimitive(type, name) {
  const info = primitiveMap.get(type);

  if (!info || typeof info.size !== 'number') {
    console.log(`Unknown type '${type}' at field '${name}'.`);
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
      console.log(`Unknown type at field '${name}'.`);
      stopped = true;
      break;
    }

    if (primitiveMap.has(call.type)) {
      const field = readPrimitive(call.type, name);

      if (field === null) break;

      result.push(field);
      continue;
    }

    const childDefinition = definitions[call.type];

    if (!childDefinition) {
      console.log(
        `Unknown type '${call.type}' at field '${name}'.`
      );
      stopped = true;
      break;
    }

    const child = walkDefinition(call.type);

    result.push({
      name,
      type: call.type,
      fields: child
    });
  }

  return result;
}

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
  console.log('Parsing stopped at unknown type.');
}

console.log('Output: parsed.json');