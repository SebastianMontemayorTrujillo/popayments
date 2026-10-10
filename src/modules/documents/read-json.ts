export function readJsonWithUniqueKeys(source: string): unknown {
  const frames: Array<{ type: 'object'; keys: Set<string>; expectKey: boolean } | { type: 'array' }> = [];
  for (let index = 0; index < source.length; index++) {
    const char = source[index];
    if (char === '"') {
      const start = index++;
      while (index < source.length) {
        if (source[index] === '\\') { index += 2; continue; }
        if (source[index] === '"') break;
        index++;
      }
      const token = source.slice(start, index + 1);
      const frame = frames.at(-1);
      if (frame?.type === 'object' && frame.expectKey) {
        const key = JSON.parse(token) as string;
        if (frame.keys.has(key)) throw new Error(`Clave JSON duplicada: ${key}`);
        frame.keys.add(key);
        frame.expectKey = false;
      }
    } else if (char === '{') {
      frames.push({ type: 'object', keys: new Set(), expectKey: true });
      if (frames.length > 20) throw new Error('JSON excede profundidad máxima');
    } else if (char === '[') {
      frames.push({ type: 'array' });
      if (frames.length > 20) throw new Error('JSON excede profundidad máxima');
    } else if (char === '}' || char === ']') {
      frames.pop();
    } else if (char === ',') {
      const frame = frames.at(-1);
      if (frame?.type === 'object') frame.expectKey = true;
    }
  }
  return JSON.parse(source) as unknown;
}
