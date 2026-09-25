import { enumReverse, primitiveMap } from "../walk.js";
import { offset, readBytes } from "./util.js";
export function readEnum(type, name) {
    const primitiveInfo = primitiveMap.get('int');
    if (!primitiveInfo) {
        throw new Error('primitive.json must contain int');
    }
    const fieldOffset = offset;
    const raw = readBytes(primitiveInfo.size);
    const value = raw.readInt32LE(0);
    const reverse = enumReverse.get(type);
    const enumName = reverse?.get(value) ?? null;
    return {
        name,
        type,
        offset: fieldOffset,
        data: raw.toString('hex'),
        size: primitiveInfo.size,
        value,
        enumName,
    };
}
//# sourceMappingURL=enum.js.map