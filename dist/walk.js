import { readFileSync, writeFileSync } from 'fs';
import { Init, offset, readBytes, readString, Stop, stopped, typeArgs, typeName, typeToString } from './generics/util.js';
import { readVector } from './generics/vector.js';
import { readPrimitive } from './generics/primitive.js';
import { readEnum } from './generics/enum.js';
import { readUnorderedSet } from './generics/unorderedset.js';
import { readCvEnumMap } from './generics/cvenummap.js';
import { readPair } from './generics/pair.js';
const definitions = JSON.parse(readFileSync('definitions.json', 'utf8'));
const primitive = JSON.parse(readFileSync('primitive.json', 'utf8'));
const enums = JSON.parse(readFileSync('enum.json', 'utf8'));
export const tableCount = JSON.parse(readFileSync('tableCount.json', 'utf8'));
const iterate = JSON.parse(readFileSync('iterate.json', 'utf8'));
export const primitiveMap = new Map(primitive.map(type => [type.name, type]));
const input = process.argv[2];
if (!input) {
    throw new Error('Decompressed file path is required.');
}
Init(input);
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
        if (stopped)
            break;
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
                const counts = [];
                for (const state of call.state || []) {
                    if (state.of !== 'for')
                        continue;
                    const value = iterate[state.exp];
                    if (value === undefined) {
                        throw new Error(`Unknown iteration expression '${state.exp}'.`);
                    }
                    const count = typeof value === 'number'
                        ? value
                        : tableCount[value];
                    if (count === undefined) {
                        throw new Error(`Unknown iteration count '${value}'.`);
                    }
                    counts.push(count);
                }
                if (counts.length !== indices.length) {
                    throw new Error(`Index/state mismatch at '${name}': ` +
                        `${indices.length} indices, ${counts.length} loops.`);
                }
                // 모든 loop 조합을 생성
                function walkIndices(depth, currentName) {
                    if (depth === counts.length) {
                        result.push(readType(elementType, currentName));
                        return;
                    }
                    for (let i = 0; counts[depth] && i < counts[depth]; i++) {
                        walkIndices(depth + 1, `${currentName}[${i}]`);
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
    const current = dimensions[depth];
    if (!current) {
        throw new Error(`Invalid array dimensions at '${name}'.`);
    }
    ;
    const count = getArrayCount(current);
    const values = [];
    for (let i = 0; i < count; i++) {
        const childName = `${name}[${i}]`;
        if (depth + 1 < dimensions.length) {
            values.push(readArray(type, dimensions, childName, depth + 1));
        }
        else {
            values.push(readType(type, childName));
        }
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
        data: raw.toString('hex')
    };
}
export function readType(type, name) {
    if (stopped)
        return null;
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
        || typeNameValue === 'TContainer') {
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
    ...readSaveHeader(),
    CvGame: walkDefinition('CvGame'),
    GameDB: readCvString('GameDB'),
    CvMap: walkDefinition('CvMap'),
};
writeFileSync('parsed.json', JSON.stringify(result, null, 2));
console.log(`Save Version: ${result.saveVersion}`);
console.log(`Game Data Hash: ${result.gameDataHash.join(', ')}`);
console.log(`Version: ${result.version}`);
console.log(`Read through offset: 0x${offset.toString(16)}`);
if (stopped) {
    console.log('Parsing stopped at unsupported/unknown type.');
}
console.log('Output: parsed.json');
//# sourceMappingURL=walk.js.map