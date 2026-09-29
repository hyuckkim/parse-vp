export type CppType = {
  name: string;
  args: CppType[];
};

export type FieldDefinition = {
  type: CppType;
  name: string;
  dimensions?: string[];
};
let typedefs: Record<string, string> = {};
export function recordAllFields(cls: string, options: Partial<{
    typedefs: Record<string, string>
}> = {}): FieldDefinition[] {
    typedefs = options.typedefs ?? {};
    
  const body = extractClassBody(cls);

  return getTopLevelDeclarations(body)
    .map(removeComments)
    .map(line => line.trim())
    .filter(isFieldCandidate)
    .map(parseField)
    .filter((field): field is FieldDefinition => field !== null);
}

function extractClassBody(cls: string): string {
  const start = cls.indexOf('{');
  const end = cls.lastIndexOf('}');

  if (start === -1 || end === -1 || start >= end) {
    return '';
  }

  return cls.slice(start + 1, end);
}

function getTopLevelDeclarations(body: string): string[] {
  const result: string[] = [];

  let depth = 0;
  let current = '';

  for (let i = 0; i < body.length; i++) {
    const ch = body[i];

    if (ch === '{') {
      depth++;

      if (depth === 1) {
        // 지금까지의 선언은 nested declaration의 시작
        current = '';
      }

      continue;
    }

    if (ch === '}') {
      depth--;

      if (depth === 0) {
        current = '';
      }

      continue;
    }

    if (depth === 0) {
      if (ch === '\n') {
        if (current.trim()) {
          result.push(current.trim());
        }
        current = '';
      } else {
        current += ch;
      }
    }
  }

  if (current.trim()) {
    result.push(current.trim());
  }

  return result;
}

function removeComments(line: string): string {
  return line
    .replace(/\/\/.*$/, '')
    .replace(/\/\*.*?\*\//g, '')
    .trim();
}

function isFieldCandidate(line: string): boolean {
  if (!line) {
    return false;
  }

  if (line.startsWith('public:')) {
    return false;
  }

  if (line.startsWith('protected:')) {
    return false;
  }

  if (line.startsWith('private:')) {
    return false;
  }

  if (line.startsWith('using ')) {
    return false;
  }

  if (line.startsWith('typedef ')) {
    return false;
  }

  if (line.includes('(') || line.includes(')')) {
    return false;
  }

  return line.endsWith(';');
}

function parseField(line: string): FieldDefinition | null {
  const declaration = removeInitializer(line);

  if (!declaration.endsWith(';')) {
    return null;
  }

  const withoutSemicolon = declaration.slice(0, -1).trim();

  const namePart = extractFieldName(withoutSemicolon);

  if (!namePart) {
    return null;
  }

  const {
    name,
    dimensions,
    typeSource
  } = namePart;

  const type = parseCppType(typeSource);

  if (!type) {
    return null;
  }

  return {
    type,
    name,
    ...(dimensions.length > 0 ? { dimensions } : {})
  };
}

function removeInitializer(line: string): string {
  let angleDepth = 0;
  let bracketDepth = 0;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];

    if (ch === '<') {
      angleDepth++;
      continue;
    }

    if (ch === '>') {
      angleDepth--;
      continue;
    }

    if (ch === '[') {
      bracketDepth++;
      continue;
    }

    if (ch === ']') {
      bracketDepth--;
      continue;
    }

    if (ch === '=' && angleDepth === 0 && bracketDepth === 0) {
      return line.slice(0, i).trim() + ';';
    }
  }

  return line;
}

function extractFieldName(line: string): {
  name: string;
  dimensions: string[];
  typeSource: string;
} | null {
  let end = line.length;

  const dimensions: string[] = [];

  while (true) {
    const close = line.lastIndexOf(']', end - 1);

    if (close === -1) {
      break;
    }

    const open = line.lastIndexOf('[', close);

    if (open === -1) {
      break;
    }

    const dimension = line.slice(open + 1, close).trim();

    dimensions.unshift(dimension);

    end = open;
  }

  const beforeName = line.slice(0, end).trim();

  const nameEnd = findIdentifierEnd(beforeName);

  if (nameEnd === -1) {
    return null;
  }

  const nameStart = findIdentifierStart(beforeName, nameEnd);

  if (nameStart === -1) {
    return null;
  }

  const name = beforeName.slice(nameStart, nameEnd);

  if (!isIdentifier(name)) {
    return null;
  }

  const typeSource = beforeName.slice(0, nameStart).trim();

  if (!typeSource) {
    return null;
  }

  return {
    name,
    dimensions,
    typeSource
  };
}

function findIdentifierEnd(str: string): number {
  let i = str.length - 1;

  while (i >= 0 && /\s/.test(str[i]!)) {
    i--;
  }

  return i + 1;
}

function findIdentifierStart(str: string, end: number): number {
  let i = end - 1;

  while (i >= 0 && isIdentifierChar(str[i]!)) {
    i--;
  }

  return i + 1;
}

function isIdentifier(value: string): boolean {
  if (!value) {
    return false;
  }

  if (!/[A-Za-z_]/.test(value[0]!)) {
    return false;
  }

  for (const ch of value.slice(1)) {
    if (!isIdentifierChar(ch)) {
      return false;
    }
  }

  return true;
}

function isIdentifierChar(ch: string): boolean {
  return /[A-Za-z0-9_]/.test(ch);
}

function parseCppType(source: string): CppType | null {
  let type = source.trim();

  // pointer / reference 제거
  type = removePointersAndReferences(type);

  // const / volatile / static / mutable 제거
  type = removeTypeQualifiers(type);

  type = type.trim();

  if (!type) {
    return null;
  }

  return parseGenericType(type);
}

function removePointersAndReferences(type: string): string {
  return type
    .replace(/\s*[*&]+\s*/g, ' ')
    .trim();
}

function removeTypeQualifiers(type: string): string {
  const qualifiers = new Set([
    'static',
    'mutable',
    'const',
    'volatile'
  ]);

  return type
    .split(/\s+/)
    .filter(part => !qualifiers.has(part))
    .join(' ');
}

function parseGenericType(source: string): CppType {
  const type = source.trim();
    const alias = typedefs?.[type];

  if (alias) {
    return parseGenericType(alias);
  }
  const open = findTopLevelGenericOpen(type);

  if (open === -1) {
    return {
      name: type,
      args: []
    };
  }

  const close = findMatchingAngle(type, open);

  if (close === -1) {
    return {
      name: type,
      args: []
    };
  }

  const name = type.slice(0, open).trim();
  const argsSource = type.slice(open + 1, close);

  return {
    name,
    args: splitGenericArgs(argsSource)
      .map(parseCppType)
      .filter((arg): arg is CppType => arg !== null)
  };
}

function findTopLevelGenericOpen(type: string): number {
  let parenDepth = 0;
  let bracketDepth = 0;

  for (let i = 0; i < type.length; i++) {
    const ch = type[i];

    if (ch === '(') parenDepth++;
    if (ch === ')') parenDepth--;
    if (ch === '[') bracketDepth++;
    if (ch === ']') bracketDepth--;

    if (
      ch === '<' &&
      parenDepth === 0 &&
      bracketDepth === 0
    ) {
      return i;
    }
  }

  return -1;
}

function findMatchingAngle(type: string, open: number): number {
  let depth = 0;

  for (let i = open; i < type.length; i++) {
    const ch = type[i];

    if (ch === '<') {
      depth++;
      continue;
    }

    if (ch === '>') {
      depth--;

      if (depth === 0) {
        return i;
      }
    }
  }

  return -1;
}

function splitGenericArgs(source: string): string[] {
  const result: string[] = [];

  let start = 0;
  let angleDepth = 0;
  let parenDepth = 0;
  let bracketDepth = 0;

  for (let i = 0; i < source.length; i++) {
    const ch = source[i];

    if (ch === '<') {
      angleDepth++;
      continue;
    }

    if (ch === '>') {
      angleDepth--;
      continue;
    }

    if (ch === '(') {
      parenDepth++;
      continue;
    }

    if (ch === ')') {
      parenDepth--;
      continue;
    }

    if (ch === '[') {
      bracketDepth++;
      continue;
    }

    if (ch === ']') {
      bracketDepth--;
      continue;
    }

    if (
      ch === ',' &&
      angleDepth === 0 &&
      parenDepth === 0 &&
      bracketDepth === 0
    ) {
      result.push(source.slice(start, i).trim());
      start = i + 1;
    }
  }

  const last = source.slice(start).trim();

  if (last) {
    result.push(last);
  }

  return result;
}
