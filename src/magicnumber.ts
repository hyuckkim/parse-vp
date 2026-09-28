import { readFileSync } from 'fs';

export type primitiveDef = {
    name: string,
    size: number,
    encoding: "signed" | "unsigned" | string
};
export type IterateRule = 
  | { t: 'literal'; v: number }
  | { t: 'table'; v: string }
  | { t: 'member'; v: string };

export type DefinitionType = {
  name: string; args: DefinitionType[];
}

export function readMagicNumber(path: string) {
    const magicnumbers = JSON.parse(
        readFileSync(path, 'utf8')
    );
    const primitiveMap = new Map<string, primitiveDef>(
        magicnumbers.primitive.map((type: { name: string }) => [type.name, type])
    );
    const iterateMap = new Map<string, IterateRule>(
        Object.entries(magicnumbers.iterate)
    );
    const literalMap = new Map<string, DefinitionType>(
        Object.entries(magicnumbers.literal)
    );

    return {
        primitiveMap,
        iterateMap,
        literalMap
    }
}
