const fs = require('fs');
const path = require('path');

const input = process.argv[2];

function main(src) {
  const primitivePath = path.join(__dirname, 'primitive.json');
  const primitive = JSON.parse(fs.readFileSync(primitivePath, 'utf8'));
  const primitiveMap = new Map(
    primitive.map(type => [type.name, type])
  );

  const definitions = collectDefinitions(
    'CvGame',
    src,
    primitiveMap
  );

  fs.writeFileSync(
    'definitions.json',
    JSON.stringify(definitions, null, 2)
  );
}

function collectDefinitions(rootType, src, primitiveMap) {
  const definitions = {};
  const visited = new Set();
  const queue = [{ type: rootType, from: null }];

  while (queue.length > 0) {
    const current = queue.shift();

    if (visited.has(current.type)) continue;
    visited.add(current.type);

    if (primitiveMap.has(current.type)) continue;

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
      current.type,
      primitiveMap
    )) {
      if (visited.has(next.type)) continue;

      queue.push(next);
    }
  }

  return definitions;
}

function getRecursiveTypes(definition, from, primitiveMap) {
  const result = [];

  for (const call of definition.calls) {
    if (!call.type) continue;

    const types = getCustomTypes(call.type, primitiveMap);

    for (const type of types) {
      result.push({
        type,
        from
      });
    }
  }

  return result;
}

function getCustomTypes(type, primitiveMap) {
  if (type.args.length === 0) {
    if (primitiveMap.has(type.name)) {
      return [];
    }

    return [type.name];
  }

  const result = [];

  for (const arg of type.args) {
    result.push(...getCustomTypes(arg, primitiveMap));
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
    new RegExp(`\\bclass\\s+${escapeRegExp(type)}\\b`),
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
    new RegExp(`\\bclass\\s+${escapeRegExp(cls)}\\b`)
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
    const trimmed = line.trim();

    if (!trimmed) continue;
    if (trimmed.startsWith('//')) continue;
    if (trimmed.startsWith('/*')) continue;

    const match = trimmed.match(
      /^(?:static\s+|mutable\s+|const\s+|volatile\s+)*(.*?)\s+([A-Za-z_]\w*)(?:\s*\[[^\]]*\])?\s*(?:=\s*[^;]+)?;$/
    );

    if (!match) continue;

    const [, type, name] = match;

    if (
      trimmed.startsWith('public:') ||
      trimmed.startsWith('protected:') ||
      trimmed.startsWith('private:')
    ) {
      continue;
    }

    result.push({
      type: type.trim(),
      name
    });
  }

  return result;
}

function enrichCalls(calls, fields) {
  const fieldMap = new Map(
    fields.map(field => [field.name, field.type])
  );

  return calls.map(call => {
    const match = call.call.match(/^([A-Za-z_]\w*)\.(.+)$/);

    if (!match) {
      return call;
    }

    const [, object, name] = match;
    const type = fieldMap.get(name);

    return {
      ...call,
      object,
      name,
      type: type ? parseType(type) : null
    };
  });
}

function parseType(type) {
  type = type.trim();

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
      .map(parseType)
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