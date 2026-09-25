export declare const tableCount: Record<string, number>;
export type CvEnumMapInfo = TypeInfo & {
    values: TypeInfo[];
};
export declare const primitiveMap: Map<string, {
    name: string;
    size: number;
}>;
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
export declare function readType(type: string, name: string): TypeInfo | NestedInfo | null;
export {};
//# sourceMappingURL=walk.d.ts.map