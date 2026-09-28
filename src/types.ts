export type CallInfo = PrimitiveInfo | ClassInfo | EnumInfo;

export type PrimitiveInfo = {
    name: string,
    size: number,
    encoding: 'signed' | 'unsigned' | 'float' | 'double' | string
}

export type ClassInfo = ClassCall[];
export type ClassCall = {
    raw: string,
    name: string,
    type: ClassCallType,
    dimensions?: string[] | undefined
}
export type ClassCallType = {
    name: string,
    args: ClassCallType[]
}
export type EnumInfo = {
    name: string,
    values: string[]
}
export type GenericInfo = {
    name: string,
    strategy: 'length' | `fixed-${number}`
}