import { z } from 'zod';
import type { TemplateDoc } from '../types/template';
import { defaultContentFor } from '../types/template';
import type { EditCommand } from '../types/commands';
import { STYLE_PROPS } from '../types/template';
import { VIEWPORTS } from '../types/viewport';

export const stylePatchSchema = z.strictObject(
  Object.fromEntries(
    [...STYLE_PROPS].map((key) => [
      key,
      key === 'textAlign'
        ? z.enum(['left', 'center', 'right']).optional()
        : key === 'color' || key === 'backgroundColor'
          ? z.string().regex(/^#[0-9a-fA-F]{3,8}$/).optional()
          : z.number().finite().optional(),
    ]),
  ),
);

const linkSchema = z.strictObject({
  label: z.string().min(1),
  href: z.string(),
});

export const elementContentSchemas = {
  heading: z.strictObject({ text: z.string() }),
  text: z.strictObject({ text: z.string() }),
  button: z.strictObject({ label: z.string(), href: z.string() }),
  image: z.strictObject({ src: z.string(), alt: z.string() }),
  list: z.strictObject({ items: z.array(z.string()) }),
  nav: z.strictObject({ brand: z.string(), links: z.array(linkSchema) }),
  section: z.strictObject({}),
} as const;

const elementTypeSchema = z.enum([
  'section',
  'heading',
  'text',
  'button',
  'image',
  'list',
  'nav',
]);

const scopedStyleSchema = z.strictObject({
  base: stylePatchSchema,
  overrides: z
    .record(z.enum(VIEWPORTS), stylePatchSchema)
    .optional(),
});

const elementContentSchema = z.union([
  elementContentSchemas.heading,
  elementContentSchemas.text,
  elementContentSchemas.button,
  elementContentSchemas.image,
  elementContentSchemas.list,
  elementContentSchemas.nav,
]);

const scopedContentShape = {
  base: elementContentSchema.optional(),
  overrides: z
    .record(z.enum(VIEWPORTS), elementContentSchema)
    .optional(),
};

const templateElementSchema = z.strictObject({
  id: z.string().min(1),
  type: elementTypeSchema,
  parentId: z.string().nullable(),
  childIds: z.array(z.string()),
  content: z.strictObject(scopedContentShape),
  style: scopedStyleSchema,
});

export const templateDocSchema = z.strictObject({
  templateId: z.string().min(1),
  templateName: z.string(),
  revision: z.number().int().nonnegative(),
  rootId: z.string().min(1),
  elements: z.record(z.string(), templateElementSchema),
});

export const editCommandSchema = z.discriminatedUnion('kind', [
  z.strictObject({
    kind: z.literal('set-content'),
    source: z.enum(['canvas', 'code', 'ai']),
    targetIds: z.tuple([z.string().min(1)]),
    scope: z.union([z.literal('all'), z.enum(VIEWPORTS)]),
    baseRevision: z.number().int().nonnegative(),
    content: elementContentSchema,
  }),
  z.strictObject({
    kind: z.literal('set-style'),
    source: z.enum(['canvas', 'code', 'ai']),
    targetIds: z.array(z.string().min(1)).min(1),
    scope: z.union([z.literal('all'), z.enum(VIEWPORTS)]),
    baseRevision: z.number().int().nonnegative(),
    stylePatch: stylePatchSchema,
  }),
  z.strictObject({
    kind: z.literal('reorder'),
    source: z.enum(['canvas', 'code', 'ai']),
    targetIds: z.tuple([z.string().min(1)]),
    scope: z.union([z.literal('all'), z.enum(VIEWPORTS)]),
    baseRevision: z.number().int().nonnegative(),
    index: z.number().int().nonnegative(),
  }),
  z.strictObject({
    kind: z.literal('insert'),
    source: z.enum(['canvas', 'code', 'ai']),
    targetIds: z.array(z.string()).max(0),
    scope: z.union([z.literal('all'), z.enum(VIEWPORTS)]),
    baseRevision: z.number().int().nonnegative(),
    parentId: z.string().min(1),
    index: z.number().int().nonnegative(),
    element: templateElementSchema,
  }),
  z.strictObject({
    kind: z.literal('remove'),
    source: z.enum(['canvas', 'code', 'ai']),
    targetIds: z.array(z.string().min(1)).min(1),
    scope: z.union([z.literal('all'), z.enum(VIEWPORTS)]),
    baseRevision: z.number().int().nonnegative(),
  }),
]);

export type CommandErrorCode =
  | 'invalid-payload'
  | 'unknown-element'
  | 'stale-revision'
  | 'invalid-target'
  | 'id-collision'
  | 'forbidden-field';

export interface CommandError {
  code: CommandErrorCode;
  message: string;
}

const err = (code: CommandErrorCode, message: string): CommandError => ({
  code,
  message,
});

function parseErrors(error: z.ZodError): CommandError[] {
  return error.issues.map((issue) =>
    err('invalid-payload', `${issue.path.join('.') || '(root)'}: ${issue.message}`),
  );
}

export function validateCommand(
  doc: TemplateDoc,
  command: EditCommand,
): CommandError[] {
  const parsed = editCommandSchema.safeParse(command);
  if (!parsed.success) return parseErrors(parsed.error);
  const cmd = parsed.data;
  const errors: CommandError[] = [];

  if (cmd.baseRevision !== doc.revision) {
    errors.push(
      err(
        'stale-revision',
        `command targets revision ${cmd.baseRevision} but current revision is ${doc.revision}`,
      ),
    );
  }

  const requireElements = (ids: string[]) => {
    for (const id of ids) {
      if (!doc.elements[id]) {
        errors.push(err('unknown-element', `unknown element id "${id}"`));
      }
    }
  };

  switch (cmd.kind) {
    case 'set-content': {
      requireElements(cmd.targetIds);
      const target = doc.elements[cmd.targetIds[0]];
      if (target) {
        const expectedKeys = Object.keys(defaultContentFor(target.type));
        if (!expectedKeys.every((key) => key in cmd.content)) {
          errors.push(
            err(
              'invalid-payload',
              `content does not match element type "${target.type}"`,
            ),
          );
        }
      }
      break;
    }
    case 'set-style': {
      requireElements(cmd.targetIds);
      break;
    }
    case 'reorder': {
      requireElements(cmd.targetIds);
      const target = doc.elements[cmd.targetIds[0]];
      if (target) {
        if (!target.parentId || !doc.elements[target.parentId]) {
          errors.push(err('invalid-target', `element "${target.id}" cannot be reordered`));
        } else {
          const siblings = doc.elements[target.parentId].childIds.length;
          if (cmd.index >= siblings) {
            errors.push(
              err('invalid-target', `reorder index ${cmd.index} out of bounds`),
            );
          }
        }
      }
      break;
    }
    case 'insert': {
      if (!doc.elements[cmd.parentId]) {
        errors.push(err('unknown-element', `unknown parent id "${cmd.parentId}"`));
      } else if (doc.elements[cmd.parentId].type !== 'section') {
        errors.push(
          err('invalid-target', `parent "${cmd.parentId}" is not a section`),
        );
      }
      if (doc.elements[cmd.element.id]) {
        errors.push(err('id-collision', `element id "${cmd.element.id}" already exists`));
      }
      const parent = doc.elements[cmd.parentId];
      if (parent && cmd.index > parent.childIds.length) {
        errors.push(err('invalid-target', `insert index ${cmd.index} out of bounds`));
      }
      break;
    }
    case 'remove': {
      requireElements(cmd.targetIds);
      if (cmd.targetIds.includes(doc.rootId)) {
        errors.push(err('forbidden-field', 'the page root cannot be removed'));
      }
      break;
    }
  }

  return errors;
}
