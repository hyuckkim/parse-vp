import { readFileSync } from 'fs';
import type { ClassCall, PrimitiveInfo } from './types.js';

export function readMagicNumber(path: string) {
    const magicnumbers = JSON.parse(
        readFileSync(path, 'utf8')
    );
    const primitiveMap = new Map<string, PrimitiveInfo>(
        magicnumbers.primitive.map((type: { name: string }) => [type.name, type])
    );
    const literalMap = new Map<string, ClassCall>(
        Object.entries(magicnumbers.literal)
    );

    return {
        primitiveMap,
        literalMap
    }
}
