import { primitiveMap } from "../walk.js";
import { Stop, offset, readBytes } from "./util.js";
export function readPrimitive(type, name) {
    const info = primitiveMap.get(type);
    if (!info || typeof info.size !== 'number') {
        return Stop(`Unknown primitive type '${type}' at field '${name}'.`);
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
//# sourceMappingURL=primitive.js.map