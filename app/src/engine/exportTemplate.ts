import type { TemplateDoc } from '../types/template';
import {
  templateDocSchema,
  validateTemplateSemantics,
  zodErrorToCommandErrors,
  type CommandError,
} from './validate';

export const TEMPLATE_FILE_FORMAT = 'fabriik-template';
export const TEMPLATE_FILE_VERSION = 1;

export interface TemplateFileEnvelope {
  format: string;
  version: number;
  exportedAt: string;
  doc: TemplateDoc;
}

export function exportTemplateJson(doc: TemplateDoc, now: Date = new Date()): string {
  const envelope: TemplateFileEnvelope = {
    format: TEMPLATE_FILE_FORMAT,
    version: TEMPLATE_FILE_VERSION,
    exportedAt: now.toISOString(),
    doc,
  };
  return `${JSON.stringify(envelope, null, 2)}\n`;
}

export type ParseTemplateResult =
  | { ok: true; doc: TemplateDoc }
  | { ok: false; errors: CommandError[] };

export function parseTemplateJson(text: string): ParseTemplateResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return {
      ok: false,
      errors: [
        { code: 'invalid-payload', message: 'file contents are not valid JSON' },
      ],
    };
  }

  let candidate: unknown = parsed;
  if (isEnvelopeShaped(parsed)) {
    const envelope = parsed as Record<string, unknown>;
    if (envelope.format !== TEMPLATE_FILE_FORMAT) {
      return {
        ok: false,
        errors: [
          {
            code: 'invalid-payload',
            message: `unknown template file format "${String(envelope.format)}": expected "${TEMPLATE_FILE_FORMAT}"`,
          },
        ],
      };
    }
    if (
      typeof envelope.version !== 'number' ||
      !Number.isInteger(envelope.version) ||
      envelope.version !== TEMPLATE_FILE_VERSION
    ) {
      return {
        ok: false,
        errors: [
          {
            code: 'invalid-payload',
            message: `unsupported template file version ${String(envelope.version)}: this editor supports version ${TEMPLATE_FILE_VERSION}`,
          },
        ],
      };
    }
    candidate = envelope.doc;
  }

  const result = templateDocSchema.safeParse(candidate);
  if (!result.success) {
    return { ok: false, errors: zodErrorToCommandErrors(result.error) };
  }
  const semanticErrors = validateTemplateSemantics(result.data);
  if (semanticErrors.length > 0) {
    return { ok: false, errors: semanticErrors };
  }
  return { ok: true, doc: result.data };
}

function isEnvelopeShaped(value: unknown): boolean {
  return typeof value === 'object' && value !== null && 'format' in value;
}
