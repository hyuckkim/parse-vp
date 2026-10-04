export type CallInfo = PrimitiveInfo | ClassInfo | EnumInfo | GenericInfo;

export type PrimitiveInfo = {
    type: 'primitive',
    name: string,
    size: number,
    encoding: 'signed' | 'unsigned' | 'float' | 'double' | string
}

export type ClassInfo = {
    type: 'class',
    name: string,
    slug?: string[] | undefined,
    calls: ClassCall[]
};
export type ClassCall = {
    raw: string,
    name: string,
    type: ClassCallType,
    dimensions?: string[] | undefined,
}
export type ClassCallType = {
    name: string,
    args?: ClassCallType[] | undefined,
}
export type EnumInfo = {
    type: 'enum',
    name: string,
    values: Record<string, number | string>,
}
export type GenericInfo = {
    type: 'generic',
    name: string,
}