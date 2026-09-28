import { type DefinitionType } from './magicnumber.js';
import { readFileSync, writeFileSync } from 'fs';
import { readMagicNumber } from './magicnumber.js';

import type { Definition } from './definition.js';
import { Init, offset, readBytes, readString, Stop, stopped, typeArgs, typeName, typeToString } from './generics/util.js';
import { readVector } from './generics/vector.js';
import { readPrimitive } from './generics/primitive.js';
import { readEnum } from './generics/enum.js';
import { readUnorderedSet } from './generics/unorderedset.js';
import { readCvEnumMap } from './generics/cvenummap.js';
import { readPair } from './generics/pair.js';
const definitions: Record<string, { calls: Definition[] }> = JSON.parse(
  readFileSync( 'definitions.json', 'utf8')
);


const enums: Record<string, Record<string, number>> = JSON.parse(
  readFileSync('enum.json', 'utf8')
);
export const tableCount: Record<string, number> = JSON.parse(
  readFileSync('tableCount.json', 'utf8')
);

const { iterateMap, primitiveMap } = readMagicNumber('magicnumbers.json');
export { primitiveMap };

export type CvEnumMapInfo = TypeInfo & {
  values: TypeInfo[];
};
type StringInfo = PrimitiveInfo & {
  value: string;
};

const input = process.argv[2];
if (!input) {
  throw new Error('Decompressed file path is required.');
}
Init(input);

function findMemberValue(resultArray: any[], targetName: string): number {
  // 앞에서부터(인덱스 0부터) 순서대로 탐색
  for (let i = 0; i < resultArray.length; i++) {
    const item = resultArray[i];
    
    if (item && item.name === targetName) {
      // 숫자 값이 제대로 존재하는지 확인
      if (typeof item.value === 'number') {
        return item.value;
      }
      
      // 만약 value가 없고 hex 문자열인 data만 있다면 변환 시도
      if (item.data) {
         // 주의: 엔디안(Endian) 문제가 있을 수 있으므로 readPrimitive에서 
         // 정확한 number 타입의 value를 넣어두는 것이 가장 안전합니다.
         return parseInt(item.data, 16); 
      }
    }
  }
  
  throw new Error(`Cannot find member '${targetName}' for dynamic iteration.`);
}

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
  const saveVersion = readBytes(4).readUInt32LE(0);

  // GameDataHash = uint32[4]
  const gameDataHash = [
    readBytes(4).readUInt32LE(0),
    readBytes(4).readUInt32LE(0),
    readBytes(4).readUInt32LE(0),
    readBytes(4).readUInt32LE(0)
  ];
  const version = readString();

  return {
    saveVersion,
    gameDataHash,
    version
  };
}

/*
 * ------------------------------------------------------------
 * Enum reverse lookup
 * ------------------------------------------------------------
 */

export const enumReverse = new Map();

for (const [enumType, values] of Object.entries(enums)) {
  const reverse = new Map();

  for (const [name, value] of Object.entries(values)) {
    reverse.set(value, name);
  }

  enumReverse.set(enumType, reverse);
}


type TypeInfo = {
  name: string;
  type: string;
  offset: number;
  size: number;
}
export type PrimitiveInfo = TypeInfo & {
  data: string;
};
export type EnumInfo = PrimitiveInfo & {
  value: number;
  enumName: string | null;
};
export type CollectionInfo = TypeInfo & {
  count: number;
  elements: TypeInfo[];
};


/*
 * ------------------------------------------------------------
 * Definition walker
 * ------------------------------------------------------------
 */
function walkDefinition(type: string): any[] | null {
  const definition = definitions[type];

  if (!definition) {
    return null;
  }

  const result = [];

  for (const call of definition.calls) {
      if (stopped) break;
      try {

    const name = call.name || call.call;

    if (!call.type) {
      Stop(`Unknown/null type at field '${name}'.`);
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
        const elementTypeName = typeName(elementType);
        if (elementTypeName && elementTypeName.endsWith('*')) {
          elementType = {
            name: elementTypeName.slice(0, -1).trim(),
            args: elementTypeName
          };
        }

        const counts: number[] = [];

        for (const state of call.state || []) {
          if (state.of !== 'for') continue;

            const value = iterateMap.get(state.exp);

          if (value === undefined) {
            throw new Error(
              `Unknown iteration expression '${state.exp}'.`
            );
          }

          const count =
            value.t === 'literal'
              ? value.v
                : tableCount[value.v];
            console.log(value.t, value.v, count);

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
        function walkIndices(depth: number, currentName: string) {
          if (depth === counts.length) {
            result.push(
              readType(elementType, currentName)
            );
            return;
          }

          for (let i = 0; counts[depth] && i < counts[depth]; i++) {
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
      catch (e: any) {
          Stop(e);
      }
  }
  return result;
}


function getArrayCount(expr: string): number {
  if (/^\d+$/.test(expr)) {
    return Number(expr);
  }

  if (expr === 'MAX_MAJOR_CIVS') {
    return 22;
  }

  throw new Error(`Unknown array count '${expr}'.`);
}

function readArray(type: DefinitionType, dimensions: string[], name: string, depth = 0): any[] {
  const current = dimensions[depth];
  if (!current) {
    throw new Error(`Invalid array dimensions at '${name}'.`);
  };
  const count = getArrayCount(current);

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


function readCvString(name: string): StringInfo {
  const start = offset;

  const length = readBytes(4).readUInt32LE(0);
  const raw = readBytes(length);

  return {
    name,
    type: 'CvString',
    offset: start,
    size: 4 + length,
    value: raw.toString('utf8'),
    data: raw.toString('hex')
  };
}

export type PairInfo = TypeInfo & {
  first: TypeInfo;
  second: TypeInfo;
};

type NestedInfo = TypeInfo & {
  fields: TypeInfo[];
};
export function readType(type: DefinitionType, name: string): TypeInfo | NestedInfo | null {
  if (stopped) return null;

  const typeNameValue = typeName(type);

  if (!typeNameValue) {
    return Stop(`Unknown/null type at field '${name}'.`);
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
  if (typeNameValue === 'std::tr1::unordered_set'
    || typeNameValue === 'TContainer'
  ) {
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
    if (fields === null) {
      throw new Error(`Failed to read nested definition '${typeNameValue}' at '${name}'.`);
    }

    return {
      name,
      type: typeNameValue,
      offset: fieldOffset,
      size: offset - fieldOffset,
      fields
    };
  }

  return Stop(`Unsupported type '${typeToString(type)}' at field '${name}'.`);
}


/*
 * ------------------------------------------------------------
 * Main
 * ------------------------------------------------------------
 */

const result = {
    //CvGame::Read()
    ...readSaveHeader(),
    CvGame: walkDefinition('CvGame'),
    GameDB: readCvString('GameDB'),

    //CvMap::Read()
    CvMap: walkDefinition('CvMap'),
    
    //CvTeam::Read() * 64
    //CvPlayer::Read() * 64
};

writeFileSync(
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
