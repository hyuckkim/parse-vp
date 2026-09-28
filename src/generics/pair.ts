import { type DefinitionType } from '../magicnumber.js';
import { readType, type PairInfo } from "../walk.js";
import { Stop, typeArgs, typeToString } from "./util.js";

export function readPair(type: DefinitionType, name: string): PairInfo | null {
  const args = typeArgs(type);

  if (args.length !== 2) {
    throw new Error(`Invalid std::pair type: ${typeToString(type)}`);
  }
  const value1 = readType(args[0], `${name}[0]`);
  const value2 = readType(args[1], `${name}[1]`);

  if (value1 === null || value2 === null) {
    return Stop(`Failed to read std::pair at '${name}'.`);
  }
  return {
    name,
    type: typeToString(type),
    offset: value1.offset,
    size: (value2.offset + value2.size) - value1.offset,
    first: value1,
    second: value2
  };
}
