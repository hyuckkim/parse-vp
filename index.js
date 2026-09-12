const fs = require('fs');
const path = require('path');

const input = process.argv[2];

const primitivePath = path.join(__dirname, 'primitive.json');
const primitive = JSON.parse(fs.readFileSync(primitivePath, 'utf8'));
const primitiveMap = new Map(
  primitive.map(type => [type.name, type])
);

const enumPath = path.join(__dirname, 'enum.json');
const enums = JSON.parse(
  fs.readFileSync(enumPath, 'utf8')
);
const enumTypes = new Set(Object.keys(enums));

const typedefPath = path.join(__dirname, 'typedef.json');
const typedefs = JSON.parse(
  fs.readFileSync(typedefPath, 'utf8')
);

function main(src) {
  const definitions = collectDefinitions(
    'CvGame',
    src
  );

  fs.writeFileSync(
    'definitions.json',
    JSON.stringify(definitions, null, 2)
  );
}

function collectDefinitions(rootType, src) {
  const definitions = {};
  const visited = new Set();
  const queue = [{ type: rootType, from: null }];

  while (queue.length > 0) {
    const current = queue.shift();

    if (visited.has(current.type)) continue;
    visited.add(current.type);

    if (primitiveMap.has(current.type)) continue;
    if (enumTypes.has(current.type)) continue;

    const definition = analyzeType(current.type, src);

    if (definition === null) {
      console.log(
        `Type '${current.type}' from '${current.from}' could not be resolved.`
      );
      continue;
    }

    definitions[current.type] = definition;

    for (const next of getRecursiveTypes(
      definition,
      current.type
    )) {
      if (visited.has(next.type)) continue;

      queue.push(next);
    }
  }

  return definitions;
}

function getRecursiveTypes(definition, from) {
  const result = [];

  for (const call of definition.calls) {
    if (!call.type) continue;

    const types = getCustomTypes(call.type);

    for (const type of types) {
      result.push({
        type,
        from
      });
    }
  }

  return result;
}

function getCustomTypes(type) {
  if (type.args.length === 0) {
    if (primitiveMap.has(type.name)) {
      return [];
    }

    return [type.name];
  }

  const result = [];

  for (const arg of type.args) {
    result.push(...getCustomTypes(arg));
  }

  return result;
}

function analyzeType(type, src) {
  const file = grepToFile(
    new RegExp(`\\b${escapeRegExp(type)}::Serialize\\b`),
    src,
    ['.cpp', '.h']
  );

  if (file === null) {
    return null;
  }

  const func = splitCppFunc(`${type}::Serialize`, file);

  if (func === null) {
    console.log(
      `Serialize function for type '${type}' could not be found.`
    );
    return null;
  }

  const calls = recordAllCalls(func);

  const header = grepToFile(
    new RegExp(`\\bclass\\s+${escapeRegExp(type)}\\b\\s*(?:\\n\\s*)?\\{`),
    src,
    ['.cpp', '.h']
  );

  if (header === null) {
    console.log(
      `Class definition for type '${type}' could not be found.`
    );
    return null;
  }

  const cls = splitCppClass(type, header);
  const fields = recordAllFields(cls);
  const typedCalls = enrichCalls(calls, fields);

  return {
    calls: typedCalls
  };
}

/** find file that includes keyword and return full file to string*/
function grepToFile(keyword, src, opt = ['.cpp', '.h']) {
  const entries = fs.readdirSync(src, { withFileTypes: true });

  for (const entry of entries) {
    const filePath = path.join(src, entry.name);

    if (entry.isDirectory()) {
      const result = grepToFile(keyword, filePath, opt);

      if (result !== null) {
        return result;
      }

      continue;
    }

    if (!entry.isFile()) continue;

    const ext = path.extname(entry.name);

    if (!opt.includes(ext)) continue;

    const content = fs.readFileSync(filePath, 'utf8');

    if (
      (typeof keyword === 'string' && content.includes(keyword)) ||
      (keyword instanceof RegExp && keyword.test(content))
    ) {
      return content;
    }
  }

  return null;
}

/** In str, return only function part of name 'func'. */
function splitCppFunc(func, str) {
  const start = str.indexOf(func);

  if (start === -1) {
    return null;
  }

  const braceStart = str.indexOf('{', start);

  if (braceStart === -1) {
    return null;
  }

  let depth = 0;

  for (let i = braceStart; i < str.length; i++) {
    if (str[i] === '{') {
      depth++;
    } else if (str[i] === '}') {
      depth--;

      if (depth === 0) {
        return str.slice(start, i + 1);
      }
    }
  }

  return null;
}
function recordAllCalls(str) {
  const result = [];
  const lines = str.split(/\r?\n/);
  const states = [];
  let braceDepth = 0;

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
    const line = lines[lineIndex].trim();

    if (!line) continue;

    const controlMatch = line.match(/^(if|for)\s*\((.*)\)\s*$/);

    if (controlMatch) {
      const [, of, exp] = controlMatch;

      states.push({
        of,
        exp: exp.trim(),
        depth: braceDepth + 1
      });
    }

    // visitor(...)
    // visitor.as<...>(...)
    const visitorMatch = line.match(
      /^visitor(?:\s*\.\s*as\s*<[^;]*?>)?\s*\(/
    );

    if (visitorMatch) {
      const openParen = line.indexOf('(', visitorMatch.index);

      if (openParen !== -1) {
        let depth = 1;
        let closeParen = -1;

        for (let i = openParen + 1; i < line.length; i++) {
          if (line[i] === '(') {
            depth++;
          } else if (line[i] === ')') {
            depth--;

            if (depth === 0) {
              closeParen = i;
              break;
            }
          }
        }

        if (closeParen !== -1) {
          const item = {
            call: line.slice(openParen + 1, closeParen).trim()
          };

          if (states.length > 0) {
            item.state = states.map(({ of, exp }) => ({
              of,
              exp
            }));
          }

          result.push(item);
        }
      }
    }

    for (const char of line) {
      if (char === '{') {
        braceDepth++;
      } else if (char === '}') {
        braceDepth--;

        while (
          states.length > 0 &&
          states[states.length - 1].depth > braceDepth
        ) {
          states.pop();
        }
      }
    }
  }

  return result;
}

function splitCppClass(cls, str) {
  const start = str.search(
    new RegExp(`\\bclass\\s+${escapeRegExp(cls)}\\b\\s*(?:\\n\\s*)?\\{`)
  );

  if (start === -1) {
    throw new Error(`Class '${cls}' was not found.`);
  }

  const braceStart = str.indexOf('{', start);

  let depth = 0;

  for (let i = braceStart; i < str.length; i++) {
    if (str[i] === '{') {
      depth++;
    } else if (str[i] === '}') {
      depth--;

      if (depth === 0) {
        return str.slice(start, i + 1);
      }
    }
  }

  throw new Error(`End of class '${cls}' was not found.`);
}

/** save every field's type and name.
    return [{type: "int", name: "m_blabla}]*/
function recordAllFields(cls) {
  const result = [];
  const bodyStart = cls.indexOf('{');
  const bodyEnd = cls.lastIndexOf('}');

  const body = cls.slice(bodyStart + 1, bodyEnd);
  const lines = body.split(/\r?\n/);

  for (const line of lines) {
    let trimmed = line.trim();

    if (!trimmed) continue;
    if (trimmed.startsWith('//')) continue;
    if (trimmed.startsWith('/*')) continue;

    trimmed = trimmed.replace(/\/\/.*$/, '').trim();
    trimmed = trimmed.replace(/\/\*.*?\*\//g, '').trim();
    if (!trimmed) continue;

    if (
      trimmed.startsWith('public:') ||
      trimmed.startsWith('protected:') ||
      trimmed.startsWith('private:')
    ) {
      continue;
    }

    const match = trimmed.match(
      /^(?:static\s+|mutable\s+|const\s+|volatile\s+)*(.*?)\s+([A-Za-z_]\w*)((?:\[[^\]]*\])*)\s*(?:=\s*[^;]+)?;$/
    );

    if (!match) continue;

    const [, rawType, name, rawDimensions] = match;


    const type = rawType
      .trim()
      .replace(/\s*\*$/, '')
      .trim();

    const dimensions = [
      ...rawDimensions.matchAll(/\[([^\]]*)\]/g)
    ].map(match => match[1].trim());

    result.push({
      type,
      name,
      dimensions
    });

  }

  return result;
}
function enrichCalls(calls, fields) {
  const fieldMap = new Map(
    fields.map(field => [field.name, field])
  );

  return calls.map(call => {
    const match = call.call.match(/^\*?([A-Za-z_]\w*)\.(.+)$/);

    if (!match) {
      return call;
    }

    const [, object, name] = match;

    // [i], [j] 같은 인덱스를 제거해서 실제 field 이름을 얻는다.
    const baseName = name.replace(/\[[A-Za-z_]\w*\]/g, '');

    const field = fieldMap.get(baseName);

    if (!field) {
      return {
        ...call,
        object,
        name,
        type: null
      };
    }

    let type = field.type;

    if (typedefs[type]) {
      type = typedefs[type];
    }

    const result = {
      ...call,
      object,
      name,
      type: parseType(type)
    };

    if (field.dimensions?.length) {
      result.dimensions = field.dimensions;
    }

    return result;
  });
}

function parseType(type) {
  type = type.trim();

  // typedef면 실제 타입으로 치환
  if (typedefs[type]) {
    return parseType(typedefs[type], typedefs);
  }

  const lt = type.indexOf('<');

  if (lt === -1) {
    return {
      name: type,
      args: []
    };
  }

  const name = type.slice(0, lt).trim();

  let depth = 0;
  let end = -1;

  for (let i = lt; i < type.length; i++) {
    if (type[i] === '<') {
      depth++;
    } else if (type[i] === '>') {
      depth--;

      if (depth === 0) {
        end = i;
        break;
      }
    }
  }

  if (end === -1) {
    throw new Error(`Invalid type '${type}'.`);
  }

  return {
    name,
    args: splitTypeArgs(type.slice(lt + 1, end))
      .map(arg => parseType(arg))
  };
}

function splitTypeArgs(str) {
  const result = [];

  let depth = 0;
  let start = 0;

  for (let i = 0; i < str.length; i++) {
    if (str[i] === '<') {
      depth++;
    } else if (str[i] === '>') {
      depth--;
    } else if (str[i] === ',' && depth === 0) {
      result.push(str.slice(start, i).trim());
      start = i + 1;
    }
  }

  const last = str.slice(start).trim();

  if (last) {
    result.push(last);
  }

  return result;
}

function escapeRegExp(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

if (!input) {
  throw new Error('Source path is required.');
}

main(input);