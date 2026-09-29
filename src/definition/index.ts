import { writeFileSync } from 'fs';
import { readMagicNumber } from '../magicnumber.js';
import type { CallInfo, ClassCall, ClassCallType, PrimitiveInfo } from '../types.js';
import { getHeaderContent, getVisitorContent } from './file.js';
import { recordAllFields } from './recordAllFields.js';
import { collectTypedefs } from '../typedef.js';

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
    
    const calls: ClassCall[] = [
        ...visitor.matchAll(
            /visitor\((.+)\);/g
        ).map((match: RegExpExecArray): ClassCall | null => {
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
        }).filter((call): call is ClassCall => !!call)
    ];
    return {
        def: calls,
        next: getEveryType(calls.map(call => call.type))
    };
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
} = readMagicNumber('magicnumber.json');
const typedefs = collectTypedefs(gamePath);
const d = collectDefinitions('CvGame', gamePath);

writeFileSync('def.json', JSON.stringify(d, null, 2), 'utf8');
