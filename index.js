const fs = require('fs');
const path = require('path');

function main(src) {
  const file = grepToFile('CvGame::Serialize', src);
  const func = splitCppFunc('CvGame::Serialize', file);
  const calls = recordAllCalls('visitor', func)
    .filter(v => v.call != '');

  const header = grepToFile('CvGame(', src, ['.h']);
  const cls = splitCppClass('CvGame', header);
  const fields = recordAllFields(cls);

  const typedCalls = enrichCalls(calls, fields);

  console.log(JSON.stringify(typedCalls));
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
    if ((typeof keyword === 'string' && content.includes(keyword)) ||
        (typeof keyword === 'object' && keyword.test(content))) {
      return content;
    }
  }

  return null;
}

/** In str, return only function part of name 'func'. */
function splitCppFunc(func, str) {
  const start = str.indexOf(func);
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
}


/** 모든 keyword가 포함된 줄마다 괄호 속의 글자를 객체로 저장함
    기계적으로 keyword와 소괄호만 봐야 함.
    예: recordAllCalls('visitor', ...) 에 대해
    visitor(m_someData) -> { call: m_someData }
    visitor.as<int>(m_otherData) -> { call: m_otherData }

    if와 for를 인식해서 데이터에 포함해야 함
    (if와 함수는 같은 줄에 포함되지 않음, 다행이다):
    if (a < b)
    {
    visitor(m_moreData) -> { call: m_moreData, state: [{ of: if, exp: 'a < b' }] }
    }
    
    for (int i = 0; i < absolute_value; i++)
    ... -> { call: m_justData, state: [{ of: for, exp: 'int i = 0 ...'}]}
 */
function recordAllCalls(keyword, str) {
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

    if (line.includes(keyword)) {
      const keywordIndex = line.indexOf(keyword);
      const openParen = line.indexOf('(', keywordIndex + keyword.length);

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
  const start = str.search(new RegExp(`\\bclass\\s+${cls}\\b`));

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

    return {
      ...call,
      object,
      name,
      type: fieldMap.get(name)
    };
  });
}

const src = process.argv[2];

if (!src) {
  throw new Error('Source path is required.');
}

main(src);
