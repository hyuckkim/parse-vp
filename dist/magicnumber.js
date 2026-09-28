import { readFileSync } from 'fs';
export function readMagicNumber(path) {
    const magicnumbers = JSON.parse(readFileSync(path, 'utf8'));
    const primitiveMap = new Map(magicnumbers.primitive.map((type) => [type.name, type]));
    const iterateMap = new Map(Object.entries(magicnumbers.iterate));
    const literalMap = new Map(Object.entries(magicnumbers.literal));
    return {
        primitiveMap,
        iterateMap,
        literalMap
    };
}
//# sourceMappingURL=magicnumber.js.map