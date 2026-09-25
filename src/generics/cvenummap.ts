import { type CvEnumMapInfo, readType, tableCount } from "../walk.js";
import { typeArgs, typeToString, typeName } from "./util.js";

function getEnumCount(enumType: string): number {
  // Fixed-count enums
  const fixedCounts: Record<string, number> = {
    PlayerTypes: 64,
    TeamTypes: 64,
    // 필요해질 때 추가
  };

  if (Object.prototype.hasOwnProperty.call(fixedCounts, enumType)) {
    return fixedCounts[enumType] ?? (() => {
      throw new Error(`Invalid fixed count for enum '${enumType}'.`);
    })();
  }

  // 기존 DB table 추론
  const candidates: Set<string> = new Set();

  candidates.add(enumType);

  if (enumType.endsWith('Types')) {
    const base = enumType.slice(0, -5);
    candidates.add(base);
    candidates.add(`${base}s`);

    if (base.endsWith('s') ||
    base.endsWith('x') ||
    base.endsWith('z') ||
    base.endsWith('ch') ||
    base.endsWith('sh')) {
      candidates.add(`${base}es`);
    } else if (base.endsWith('y')) {
      candidates.add(`${base.slice(0, -1)}ies`);
    } else {
      candidates.add(`${base}s`);
    }

    candidates.add(`${base}Info`);
    candidates.add(`${base}Infos`);
  }

  if (enumType.endsWith('Type')) {
    const base = enumType.slice(0, -4);
    candidates.add(base);
    candidates.add(`${base}s`);

    if (base.endsWith('y')) {
      candidates.add(`${base.slice(0, -1)}ies`);
    }

    candidates.add(`${base}Info`);
    candidates.add(`${base}Infos`);
  }

  for (const tableName of candidates) {
    if (Object.prototype.hasOwnProperty.call(tableCount, tableName)) {
      const count = tableCount[tableName];

      if (count === undefined) {
        throw new Error(
          `Invalid table count for '${tableName}': ${count}`
        );
      }

      return count;
    }
  }

  throw new Error(
    `Cannot resolve DB table for enum '${enumType}'. ` +
    `Tried: ${[...candidates].join(', ')}`
  );
}

export function readCvEnumMap(type: string, name: string): CvEnumMapInfo | null {
  const args = typeArgs(type);

  if (args.length < 2) {
    throw new Error(`Invalid CvEnumMap type: ${typeToString(type)}`);
  }

  const enumType = typeName(args[0]);
  const valueType = args[1];

  if (!enumType) {
    throw new Error(`Invalid enum type in CvEnumMap: ${typeToString(type)}`);
  }
  if (!valueType) {
    throw new Error(`Invalid value type in CvEnumMap: ${typeToString(type)}`);
  }
  const count = getEnumCount(enumType);

  const values = [];

  for (let i = 0; i < count; i++) {
    const element = readType(valueType, `${name}[${i}]`);
    if (element === null) {
      throw new Error(`Failed to read CvEnumMap element at '${name}[${i}]'.`);
    }
    values.push(element);
  }

  return {
    name,
    type: typeToString(type),
    offset: values[0]?.offset ?? 0,
    size: count * (values[0]?.size ?? 0),
    values
  };
}