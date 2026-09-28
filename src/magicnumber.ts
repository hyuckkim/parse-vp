import { readFileSync } from 'fs';
import type { Definition } from './definition.js';
import type { PrimitiveInfo } from './types.js';

export function readMagicNumber(path: string) {
    const magicnumbers = JSON.parse(
        readFileSync(path, 'utf8')
    );
    const primitiveMap = new Map<string, PrimitiveInfo>(
        magicnumbers.primitive.map((type: { name: string }) => [type.name, type])
    );
    const literalMap = new Map<string, Definition>(
        Object.entries(magicnumbers.literal)
    );

    return {
        primitiveMap,
        literalMap
    }
}
