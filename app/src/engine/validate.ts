import { z } from 'zod';
import type { TemplateDoc } from '../types/template';
import { defaultContentFor } from '../types/template';
import type { EditCommand } from '../types/commands';
import { STYLE_PROPS } from '../types/template';
import { VIEWPORTS } from '../types/viewport';

const viewportRecord = <T extends z.ZodType>(valueSchema: T) =>
  z.strictObject(
    Object.fromEntries(VIEWPORTS.map((vp) => [vp, valueSchema.optional()])),
  );

export const stylePatchSchema = z.strictObject(
  Object.fromEntries(
    [...STYLE_PROPS].map((key) => [
      key,
      key === 'textAlign'
        ? z.enum(['left', 'center', 'right']).optional()
        : key === 'color' || key === 'backgroundColor'
          ? z.string().regex(/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/).optional()
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
  overrides: viewportRecord(stylePatchSchema).optional(),
});

const elementContentSchema = z.union([
  elementContentSchemas.heading,
  elementContentSchemas.text,
  elementContentSchemas.button,
  elementContentSchemas.image,
  elementContentSchemas.list,
  elementContentSchemas.nav,
  elementContentSchemas.section,
]);

const scopedContentShape = {
  base: elementContentSchema.optional(),
  overrides: viewportRecord(elementContentSchema).optional(),
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

export function normalizeTemplateDoc(raw: z.infer<typeof templateDocSchema>): TemplateDoc {
  return {
    templateId: raw.templateId,
    templateName: raw.templateName,
    revision: raw.revision,
    rootId: raw.rootId,
    elements: Object.fromEntries(
      Object.entries(raw.elements).map(([id, element]) => [
        id,
        {
          ...element,
          content: {
            base: element.content.base ?? defaultContentFor(element.type),
            overrides: element.content.overrides,
          },
        },
      ]),
    ),
  };
}

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

export function zodErrorToCommandErrors(error: z.ZodError): CommandError[] {
  return error.issues.map((issue) =>
    err('invalid-payload', `${issue.path.join('.') || '(root)'}: ${issue.message}`),
  );
}

function parseErrors(error: z.ZodError): CommandError[] {
  return zodErrorToCommandErrors(error);
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
        const expectedKeys = Object.keys(defaultContentFor(target.type)).sort();
        const contentKeys = Object.keys(cmd.content).sort();
        const exactMatch =
          expectedKeys.length === contentKeys.length &&
          expectedKeys.every((key, i) => key === contentKeys[i]);
        if (!exactMatch) {
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
      if (cmd.element.childIds.includes(cmd.element.id)) {
        errors.push(
          err('invalid-target', `inserted element "${cmd.element.id}" cannot reference itself in childIds`),
        );
      }
      for (const childId of cmd.element.childIds) {
        if (childId === cmd.element.id) continue;
        if (doc.elements[childId]) {
          errors.push(
            err('id-collision', `child id "${childId}" already belongs to another element`),
          );
        }
      }
      if (cmd.element.parentId !== cmd.parentId) {
        errors.push(
          err(
            'invalid-payload',
            `element parentId "${cmd.element.parentId}" does not match command parent "${cmd.parentId}"`,
          ),
        );
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

export function validateTemplateSemantics(doc: TemplateDoc): CommandError[] {
  const errors: CommandError[] = [];
  const elements = doc.elements;

  if (!elements[doc.rootId]) {
    errors.push(
      err('unknown-element', `rootId "${doc.rootId}" does not exist in elements`),
    );
  }

  for (const element of Object.values(elements)) {
    if (element.id === doc.rootId && element.parentId !== null) {
      errors.push(
        err('invalid-target', `root element "${element.id}" must have a null parentId`),
      );
    }
    if (element.childIds.includes(element.id)) {
      errors.push(
        err('invalid-target', `element "${element.id}" references itself in childIds`),
      );
    }
    if (element.parentId !== null) {
      const parent = elements[element.parentId];
      if (!parent) {
        errors.push(
          err('unknown-element', `element "${element.id}" references missing parent "${element.parentId}"`),
        );
      } else if (!parent.childIds.includes(element.id)) {
        errors.push(
          err('invalid-target', `element "${parent.id}" does not list "${element.id}" in childIds`),
        );
      }
    }
    for (const childId of element.childIds) {
      const child = elements[childId];
      if (!child) {
        errors.push(
          err('unknown-element', `element "${element.id}" references missing child "${childId}"`),
        );
      } else if (child.parentId !== element.id) {
        errors.push(
          err('invalid-target', `element "${childId}" does not point back to parent "${element.id}"`),
        );
      }
    }
  }

  const reachable = new Set<string>();
  const queue = [doc.rootId];
  while (queue.length > 0) {
    const current = queue.shift();
    if (current === undefined) break;
    if (reachable.has(current)) continue;
    reachable.add(current);
    const element = elements[current];
    if (!element) continue;
    queue.push(...element.childIds);
  }
  for (const id of Object.keys(elements)) {
    if (!reachable.has(id)) {
      errors.push(
        err('invalid-target', `element "${id}" is not reachable from root "${doc.rootId}"`),
      );
    }
  }

  for (const element of Object.values(elements)) {
    const expectedKeys = Object.keys(defaultContentFor(element.type)).sort();
    const contents = [element.content.base, ...Object.values(element.content.overrides ?? {})];
    for (const content of contents) {
      const contentKeys = Object.keys(content ?? {}).sort();
      const matches =
        expectedKeys.length === contentKeys.length &&
        expectedKeys.every((key, i) => key === contentKeys[i]);
      if (!matches) {
        errors.push(
          err(
            'invalid-payload',
            `content of element "${element.id}" does not match element type "${element.type}"`,
          ),
        );
        break;
      }
    }
  }

  return errors;
}
