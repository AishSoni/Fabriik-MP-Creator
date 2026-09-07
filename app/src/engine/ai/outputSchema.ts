import { z } from 'zod';
import { elementContentSchemas, stylePatchSchema, templateElementSchema } from '../validate';

const elementContentSchema = z.union([
  elementContentSchemas.heading,
  elementContentSchemas.text,
  elementContentSchemas.button,
  elementContentSchemas.image,
  elementContentSchemas.list,
  elementContentSchemas.nav,
  elementContentSchemas.section,
]);

const aiInsertElementSchema = templateElementSchema.extend({
  content: templateElementSchema.shape.content.optional(),
  childIds: templateElementSchema.shape.childIds.default([]),
  style: templateElementSchema.shape.style.default({ base: {} }),
});

export const aiCommandSchema = z.discriminatedUnion('kind', [
  z.strictObject({
    kind: z.literal('set-content'),
    targetIds: z.array(z.string().min(1)).min(1).max(1),
    content: elementContentSchema,
  }),
  z.strictObject({
    kind: z.literal('set-style'),
    targetIds: z.array(z.string().min(1)).min(1),
    stylePatch: stylePatchSchema,
  }),
  z.strictObject({
    kind: z.literal('reorder'),
    targetIds: z.array(z.string().min(1)).min(1).max(1),
    index: z.number().int().nonnegative(),
  }),
  z.strictObject({
    kind: z.literal('insert'),
    parentId: z.string().min(1),
    index: z.number().int().nonnegative(),
    element: aiInsertElementSchema,
  }),
  z.strictObject({
    kind: z.literal('remove'),
    targetIds: z.array(z.string().min(1)).min(1),
  }),
]);

export type AiCommand = z.infer<typeof aiCommandSchema>;

export const proposalSideSchema = z.strictObject({
  content: elementContentSchema.optional(),
  style: stylePatchSchema.optional(),
});

export const aiProposalSchema = z.strictObject({
  targetId: z.string().min(1),
  explanation: z.string().min(1),
  before: proposalSideSchema.optional(),
  after: proposalSideSchema.optional(),
  command: aiCommandSchema,
});

export type AiProposal = z.infer<typeof aiProposalSchema>;

export const aiOutputSchema = z.strictObject({
  proposals: z.array(aiProposalSchema),
});

export type AiOutput = z.infer<typeof aiOutputSchema>;

export const AI_OUTPUT_JSON_SCHEMA: Record<string, unknown> = z.toJSONSchema(aiOutputSchema);
