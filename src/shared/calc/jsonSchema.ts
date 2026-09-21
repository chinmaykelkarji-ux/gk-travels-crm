// ============================================================
// zod → JSON Schema, for the subset the extraction contracts use.
//
// The model is given a schema it must answer in (structured output), and the
// same zod schema validates what comes back. One definition, two uses, so a
// field can never be asked for in one shape and checked in another.
//
// Rules that matter for strict structured output:
//   - every property is listed in `required` and `additionalProperties` is false;
//     a field the document does not show is answered as null, never left out
//     (that is also how a low-confidence field says "I could not read this")
//   - `.describe()` on a field becomes the description the model reads, so the
//     wording that teaches the model lives next to the field it belongs to
// ============================================================

import { z } from 'zod';

export interface JsonSchema {
  type?: string | string[];
  description?: string;
  properties?: Record<string, JsonSchema>;
  required?: string[];
  additionalProperties?: boolean;
  items?: JsonSchema;
  enum?: (string | number | boolean | null)[];
  const?: string | number | boolean;
  format?: string;
  minimum?: number;
  maximum?: number;
}

/** Unwraps the wrappers that only carry metadata, keeping the description. */
function unwrap(type: z.ZodTypeAny): { inner: z.ZodTypeAny; nullable: boolean; description?: string } {
  let inner = type;
  let nullable = false;
  let description = type.description;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const def = inner._def as { typeName?: string; innerType?: z.ZodTypeAny; schema?: z.ZodTypeAny };
    if (def.typeName === 'ZodNullable' || def.typeName === 'ZodOptional') {
      nullable = nullable || def.typeName === 'ZodNullable';
      inner = def.innerType as z.ZodTypeAny;
    } else if (def.typeName === 'ZodDefault' || def.typeName === 'ZodEffects' || def.typeName === 'ZodBranded') {
      inner = (def.innerType ?? def.schema) as z.ZodTypeAny;
    } else {
      break;
    }
    description = description ?? inner.description;
  }
  return { inner, nullable, description };
}

function withNull(schema: JsonSchema, nullable: boolean): JsonSchema {
  if (!nullable) return schema;
  if (schema.enum) return { ...schema, enum: [...schema.enum, null] };
  const type = schema.type;
  if (typeof type === 'string') return { ...schema, type: [type, 'null'] };
  return schema;
}

/** The subset of zod the extraction contracts are written in. */
export function toJsonSchema(type: z.ZodTypeAny): JsonSchema {
  const { inner, nullable, description } = unwrap(type);
  const def = inner._def as {
    typeName: string;
    values?: string[];
    value?: string | number | boolean;
    type?: z.ZodTypeAny;
    shape?: () => Record<string, z.ZodTypeAny>;
    options?: z.ZodTypeAny[];
    checks?: { kind: string; value?: number }[];
  };
  const described = (s: JsonSchema): JsonSchema => (description ? { ...s, description } : s);

  switch (def.typeName) {
    case 'ZodString': {
      const s: JsonSchema = { type: 'string' };
      return described(withNull(s, nullable));
    }
    case 'ZodNumber': {
      const s: JsonSchema = { type: 'number' };
      for (const c of def.checks ?? []) {
        if (c.kind === 'min' && typeof c.value === 'number') s.minimum = c.value;
        if (c.kind === 'max' && typeof c.value === 'number') s.maximum = c.value;
        if (c.kind === 'int') s.type = 'integer';
      }
      return described(withNull(s, nullable));
    }
    case 'ZodBoolean':
      return described(withNull({ type: 'boolean' }, nullable));
    case 'ZodEnum':
      return described(withNull({ type: 'string', enum: [...(def.values ?? [])] }, nullable));
    case 'ZodLiteral':
      return described(withNull({ const: def.value as string }, nullable));
    case 'ZodArray':
      return described(withNull({ type: 'array', items: toJsonSchema(def.type as z.ZodTypeAny) }, nullable));
    case 'ZodObject': {
      const shape = (def.shape ?? (() => ({})))();
      const properties: Record<string, JsonSchema> = {};
      for (const [key, value] of Object.entries(shape)) properties[key] = toJsonSchema(value as z.ZodTypeAny);
      const s: JsonSchema = { type: 'object', properties, required: Object.keys(properties), additionalProperties: false };
      return described(withNull(s, nullable));
    }
    case 'ZodUnion': {
      // Only unions of literals are used, and they read as an enum.
      const options = (def.options ?? []) as z.ZodTypeAny[];
      const values = options.map(o => (o._def as { value?: string | number | boolean }).value);
      if (values.every(v => v !== undefined)) {
        return described(withNull({ enum: values as (string | number | boolean)[] }, nullable));
      }
      throw new Error('toJsonSchema: only unions of literals are supported');
    }
    default:
      throw new Error(`toJsonSchema: unsupported type ${def.typeName}`);
  }
}
