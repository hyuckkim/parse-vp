type DefinitionType = {
    name: string;
    args: DefinitionType[];
};
export type Definition = {
    call: string;
    state?: Array<{
        of: string;
        exp: string;
    }>;
    object?: string;
    name?: string;
    type?: DefinitionType;
    dimensions?: string[];
};
export {};
//# sourceMappingURL=definition.d.ts.map