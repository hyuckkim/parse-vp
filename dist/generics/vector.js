import {} from '../magicnumber.js';
import { readType } from '../walk.js';
import { offset, readContainerCount, typeArgs, typeToString } from './util.js';
export function readVector(type, name) {
    const args = typeArgs(type);
    if (args.length !== 1) {
        throw new Error(`Invalid vector type: ${typeToString(type)}`);
    }
    const elementType = args[0];
    const countInfo = readContainerCount();
    const elements = [];
    for (let i = 0; i < countInfo.count; ++i) {
        const element = readType(elementType, `[${i}]`);
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
//# sourceMappingURL=vector.js.map