import { writeFileSync } from 'fs';
import { readMagicNumber } from '../magicnumber.js';
import type { CallInfo, ClassCall, ClassCallType, EnumInfo, PrimitiveInfo } from '../types.js';
import { getHeaderContent, getVisitorContent } from './file.js';
import { recordAllFields, type FieldDefinition } from './recordAllFields.js';
import { collectTypedefs } from '../typedef.js';
import { getEnums } from './getEnums.js';

function collectDefinitions(rootType: string | string[], src: string): Record<string, CallInfo> {
    const visited = new Set<string>();
    const queue = Array.isArray(rootType) ? [...rootType] : [rootType];
    const result: Record<string, CallInfo> = {};

    while (queue.length > 0) {
        const typeName = queue.shift()!;
        if (!visited.has(typeName)) {
            visited.add(typeName);
            const v = visitDefinition(typeName, src);
            if (!v) {
                console.warn(`Definition not found for type: ${typeName}`);
                continue;
            }
            result[typeName] = v.def;
            queue.push(...v.next);
        }
    }
    return result;
}

function visitDefinition(typeName: string, src: string): {
    def: CallInfo,
    next: string[]
} | undefined {
    if (isPrimitiveType(typeName)) {
        const def = asPrimitiveType(typeName);
        if (!def) return;
        return { def, next: [] };
    }
    if (isEnumType(typeName)) {
        const def = asEnumType(typeName);
        if (!def) return;
        return { def, next: [] };
    }

    return searchDefinition(typeName, src);
}

function isPrimitiveType(typeName: string): boolean {
    return primitiveMap.has(typeName);
}
function asPrimitiveType(typeName: string): PrimitiveInfo | undefined {
    const def = primitiveMap.get(typeName);
    if (!def) return;

    return {
        name: def.name,
        size: def.size,
        encoding: def.encoding
    }
}
function isEnumType(typeName: string): boolean {
    return enums[typeName] !== undefined;
}
function asEnumType(typeName: string): EnumInfo | undefined {
    const def = enums[typeName];
    if (!def) return;

    return {
        name: typeName,
        values: def.fields,
    }
}

function searchDefinition(typeName: string, src: string): {
    def: CallInfo,
    next: string[]
} | undefined {
    const header = getHeaderContent(typeName, src);
    const fields = recordAllFields(header ?? '', {
        typedefs,
    });
    const visitor = getVisitorContent(typeName, src);

    if (!visitor) return;
    
    const calls: ClassCall[] = visitor.split('\n')
        .map(line => line.trim())
        .map(line => {
            return getClassCall(line, fields)
             ?? getLiteralCall(line);
        })
        .filter((call): call is ClassCall => call !== null);

    return {
        def: calls,
        next: getEveryType(calls.map(call => call.type))
    };
}

function getClassCall(line: string, fields: FieldDefinition[]): ClassCall | null {
    const match = line.match(/visitor\((.+)\);/);
    if (!match) return null;

    const call = match[1]?.trim();
    if (!call) return null;

    const type = patternizeCall(call);
    if (!type) return null;

    const field = fields.find(field => field.name === type);
    if (!field) return null;

    return {
        name: type,
        raw: call,
        type: field.type,
        dimensions: field.dimensions
    };
}
function getLiteralCall(line: string): ClassCall | null {
    if (!literalMap.has(line)) {
        return null;
    }
    return literalMap.get(line) || null;
}

function getEveryType(call: ClassCallType[]): string[] {
    const types: Set<string> = new Set();
    const queue = [...call];
    while (queue.length > 0) {
        const current = queue.shift()!;
        types.add(current.name);
        queue.push(...current.args);
    }
    return Array.from(types);
}

function patternizeCall(call: string): string | null {
    const result = patternizeNormalType(call);

    if (!result) {
        console.warn(`Failed to patternize call: ${call}`);
    }
    return result;
}

function patternizeNormalType(call: string): string | null {
    const splitted = call.split('.');
    if (splitted.length !== 2) return null;
    return splitted[1]!;
}

const gamePath = 'Community-Patch-DLL';
const {
    primitiveMap,
    literalMap,
} = readMagicNumber('magicnumber.json');
const typedefs = collectTypedefs(gamePath);
const enums = {
    ...await getEnums('Civ5CoreDatabase.db',
    `${gamePath}\\CvGameCoreDLLUtil\\include\\CvEnums.h`),
    ...await getEnums('Civ5CoreDatabase.db',
    `${gamePath}\\CvGameCoreDLL_Expansion2\\CvDiplomacyAIEnums.h`)
};
// writeFileSync('enums.json', JSON.stringify(enums, null, 2), 'utf8');

const d = collectDefinitions('CvGame', gamePath);
writeFileSync('def.json', JSON.stringify(d, null, 2), 'utf8');
