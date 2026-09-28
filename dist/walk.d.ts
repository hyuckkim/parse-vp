import { type DefinitionType } from './magicnumber.js';
export declare const tableCount: Record<string, number>;
declare const { iterateMap, primitiveMap }: {
    primitiveMap: Map<string, import("./magicnumber.js").primitiveDef>;
    iterateMap: Map<string, import("./magicnumber.js").IterateRule>;
    literalMap: Map<string, DefinitionType>;
};
export { primitiveMap };
export type CvEnumMapInfo = TypeInfo & {
    values: TypeInfo[];
};
export declare const enumReverse: Map<any, any>;
type TypeInfo = {
    name: string;
    type: string;
    offset: number;
    size: number;
};
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
export type PairInfo = TypeInfo & {
    first: TypeInfo;
    second: TypeInfo;
};
type NestedInfo = TypeInfo & {
    fields: TypeInfo[];
};
export declare function readType(type: DefinitionType, name: string): TypeInfo | NestedInfo | null;
//# sourceMappingURL=walk.d.ts.map