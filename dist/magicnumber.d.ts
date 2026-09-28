export type primitiveDef = {
    name: string;
    size: number;
    encoding: "signed" | "unsigned" | string;
};
export type IterateRule = {
    t: 'literal';
    v: number;
} | {
    t: 'table';
    v: string;
} | {
    t: 'member';
    v: string;
};
export type DefinitionType = {
    name: string;
    args: DefinitionType[];
};
export declare function readMagicNumber(path: string): {
    primitiveMap: Map<string, primitiveDef>;
    iterateMap: Map<string, IterateRule>;
    literalMap: Map<string, DefinitionType>;
};
//# sourceMappingURL=magicnumber.d.ts.map