export type VdfNode = { [key: string]: string | VdfNode };

function tokenize(input: string): string[] {
  const tokens: string[] = [];
  let i = input.charCodeAt(0) === 0xfeff ? 1 : 0;
  while (i < input.length) {
    const char = input[i];
    if (/\s/.test(char)) { i += 1; continue; }
    if (char === '/' && input[i + 1] === '/') {
      while (i < input.length && input[i] !== '\n') i += 1;
      continue;
    }
    if (char === '{' || char === '}') { tokens.push(char); i += 1; continue; }
    if (char === '"') {
      i += 1;
      let value = '';
      while (i < input.length) {
        if (input[i] === '\\' && i + 1 < input.length) {
          const next = input[i + 1];
          value += next === 'n' ? '\n' : next === 't' ? '\t' : next;
          i += 2;
          continue;
        }
        if (input[i] === '"') { i += 1; break; }
        value += input[i++];
      }
      tokens.push(value);
      continue;
    }
    let value = '';
    while (i < input.length && !/\s|\{|\}/.test(input[i])) value += input[i++];
    if (value) tokens.push(value);
  }
  return tokens;
}

export function parseVdf(input: string): VdfNode {
  const tokens = tokenize(input);
  let cursor = 0;
  const parseObject = (expectsClose: boolean): VdfNode => {
    const object: VdfNode = {};
    while (cursor < tokens.length) {
      const key = tokens[cursor++];
      if (key === '}') {
        if (!expectsClose) throw new Error('Unexpected closing brace in VDF');
        return object;
      }
      const value = tokens[cursor++];
      if (value === undefined) throw new Error(`Missing value for VDF key ${key}`);
      object[key] = value === '{' ? parseObject(true) : value;
    }
    if (expectsClose) throw new Error('Unclosed VDF object');
    return object;
  };
  return parseObject(false);
}

const escapeVdf = (value: string) => value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');

export function stringifyVdf(node: VdfNode, depth = 0): string {
  const indent = '\t'.repeat(depth);
  return Object.entries(node).map(([key, value]) => {
    if (typeof value === 'string') return `${indent}"${escapeVdf(key)}"\t\t"${escapeVdf(value)}"\n`;
    return `${indent}"${escapeVdf(key)}"\n${indent}{\n${stringifyVdf(value, depth + 1)}${indent}}\n`;
  }).join('');
}

export function findKey(node: VdfNode, wanted: string): string | undefined {
  return Object.keys(node).find((key) => key.toLowerCase() === wanted.toLowerCase());
}

export function readValue(node: VdfNode, wanted: string): string {
  const key = findKey(node, wanted);
  const value = key ? node[key] : undefined;
  return typeof value === 'string' ? value : '';
}

export function setValue(node: VdfNode, wanted: string, value: string): void {
  const key = findKey(node, wanted) ?? wanted;
  node[key] = value;
}
