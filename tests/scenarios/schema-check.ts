// A small JSON Schema (draft 2020-12) checker for the keywords docs/scenario.schema.json uses: type,
// const, enum, properties, required, additionalProperties, propertyNames, maxProperties, items,
// minItems, maxItems, minLength, maxLength, pattern, minimum, maximum, $ref (local #/$defs/...),
// allOf, anyOf, if/then. Any other keyword makes the check fail loudly, so the schema cannot grow a
// keyword this checker silently ignores. No dependency (the project has no JSON Schema validator).

type Schema = Record<string, unknown> | boolean;

const KNOWN = new Set([
  '$schema', '$id', 'title', 'description', '$defs', 'type', 'const', 'enum', 'properties', 'required',
  'additionalProperties', 'propertyNames', 'maxProperties', 'items', 'minItems', 'maxItems', 'minLength',
  'maxLength', 'pattern', 'minimum', 'maximum', '$ref', 'allOf', 'anyOf', 'if', 'then',
]);

const typeOf = (v: unknown): string =>
  v === null ? 'null' : Array.isArray(v) ? 'array' : typeof v === 'number' ? (Number.isInteger(v) ? 'integer' : 'number') : typeof v;

const typeMatches = (t: string, v: unknown) => {
  const actual = typeOf(v);
  return t === actual || (t === 'number' && actual === 'integer');
};

const equal = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** The schema errors of `value` (empty: valid), each `<path>: <keyword> ...`. */
export function checkSchema(root: Record<string, unknown>, value: unknown): string[] {
  const errors: string[] = [];
  const resolve = (ref: string): Schema => {
    const m = /^#\/\$defs\/(.+)$/.exec(ref);
    const defs = root.$defs as Record<string, Schema> | undefined;
    if (!m || !defs || !(m[1]! in defs)) throw new Error(`unresolvable $ref ${ref}`);
    return defs[m[1]!]!;
  };
  const check = (schema: Schema, v: unknown, path: string, out: string[]): void => {
    if (schema === true) return;
    if (schema === false) {
      out.push(`${path}: false schema`);
      return;
    }
    for (const k of Object.keys(schema)) if (!KNOWN.has(k)) throw new Error(`schema keyword '${k}' not supported by the checker`);
    const s = schema as Record<string, unknown>;
    if (s.$ref !== undefined) check(resolve(s.$ref as string), v, path, out);
    if (s.type !== undefined) {
      const types = Array.isArray(s.type) ? (s.type as string[]) : [s.type as string];
      if (!types.some((t) => typeMatches(t, v))) out.push(`${path}: type ${types.join('|')} expected, got ${typeOf(v)}`);
    }
    if ('const' in s && !equal(s.const, v)) out.push(`${path}: const ${JSON.stringify(s.const)}`);
    if (s.enum !== undefined && !(s.enum as unknown[]).some((e) => equal(e, v))) out.push(`${path}: enum`);
    if (typeof v === 'string') {
      if (typeof s.minLength === 'number' && [...v].length < s.minLength) out.push(`${path}: minLength`);
      if (typeof s.maxLength === 'number' && [...v].length > s.maxLength) out.push(`${path}: maxLength`);
      if (typeof s.pattern === 'string' && !new RegExp(s.pattern, 'u').test(v)) out.push(`${path}: pattern ${s.pattern}`);
    }
    if (typeof v === 'number') {
      if (typeof s.minimum === 'number' && v < s.minimum) out.push(`${path}: minimum ${s.minimum}`);
      if (typeof s.maximum === 'number' && v > s.maximum) out.push(`${path}: maximum ${s.maximum}`);
    }
    if (Array.isArray(v)) {
      if (typeof s.minItems === 'number' && v.length < s.minItems) out.push(`${path}: minItems`);
      if (typeof s.maxItems === 'number' && v.length > s.maxItems) out.push(`${path}: maxItems`);
      if (s.items !== undefined) v.forEach((x, i) => check(s.items as Schema, x, `${path}[${i}]`, out));
    }
    if (typeOf(v) === 'object') {
      const o = v as Record<string, unknown>;
      const props = (s.properties ?? {}) as Record<string, Schema>;
      for (const r of (s.required ?? []) as string[]) if (!Object.hasOwn(o, r)) out.push(`${path}: required ${r}`);
      if (typeof s.maxProperties === 'number' && Object.keys(o).length > s.maxProperties) out.push(`${path}: maxProperties`);
      for (const k of Object.keys(o)) {
        if (s.propertyNames !== undefined) check(s.propertyNames as Schema, k, `${path}.${k} (name)`, out);
        if (Object.hasOwn(props, k)) check(props[k]!, o[k], `${path}.${k}`, out);
        else if (s.additionalProperties !== undefined) check(s.additionalProperties as Schema, o[k], `${path}.${k}`, out);
      }
    }
    for (const sub of (s.allOf ?? []) as Schema[]) check(sub, v, path, out);
    if (s.anyOf !== undefined) {
      const ok = (s.anyOf as Schema[]).some((sub) => {
        const e: string[] = [];
        check(sub, v, path, e);
        return e.length === 0;
      });
      if (!ok) out.push(`${path}: anyOf`);
    }
    if (s.if !== undefined) {
      const e: string[] = [];
      check(s.if as Schema, v, path, e);
      if (e.length === 0 && s.then !== undefined) check(s.then as Schema, v, path, out);
    }
  };
  check(root, value, '$', errors);
  return errors;
}
