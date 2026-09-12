import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { createDefaultTemplate } from '../template/defaultTemplate';
import { diffDocs } from './diffCommands';
import { validateCommand } from './validate';
import { initializeTemplateYDoc, projectDoc } from '../collab/schema';
import { applyCommandToYDoc } from '../collab/commandAdapter';
import type { TemplateDoc } from '../types/template';

const clone = (doc: TemplateDoc): TemplateDoc => JSON.parse(JSON.stringify(doc));

describe('diffDocs', () => {
  it('produces commands that reproduce a whole-document edit through the pipeline', () => {
    const oldDoc = createDefaultTemplate();
    const newDoc = clone(oldDoc);
    newDoc.elements['hero-heading'].content.base = { text: 'A better headline' };
    newDoc.elements['hero-heading'].style.base.color = '#123456';
    newDoc.elements['cta-button'].style.overrides = { mobile: { paddingX: 12 } };
    newDoc.elements['features-section'].childIds = ['features-heading', 'feature-card-2', 'feature-card-1'];

    const { commands, errors } = diffDocs(oldDoc, newDoc, { source: 'code' });
    expect(errors).toEqual([]);

    const ydoc = new Y.Doc();
    initializeTemplateYDoc(ydoc, oldDoc);
    commands.forEach((command, i) => {
      expect(validateCommand(projectDoc(ydoc), command)).toEqual([]);
      applyCommandToYDoc(ydoc, command, { origin: 'authoritative', commandId: `diff-${i}` });
    });

    expect(JSON.stringify({ ...projectDoc(ydoc), revision: 0 })).toEqual(
      JSON.stringify({ ...newDoc, revision: 0 }),
    );
  });

  it('rejects changes to immutable fields', () => {
    const oldDoc = createDefaultTemplate();
    const newDoc = clone(oldDoc);
    newDoc.templateId = 'other-id';
    const { errors } = diffDocs(oldDoc, newDoc, { source: 'code' });
    expect(errors.length).toBeGreaterThan(0);
  });

  it('emits remove and insert for added/removed elements', () => {
    const oldDoc = createDefaultTemplate();
    const newDoc = clone(oldDoc);
    const removed = newDoc.elements['testimonial-section'];
    for (const child of removed.childIds) delete newDoc.elements[child];
    delete newDoc.elements['testimonial-section'];
    newDoc.elements['page-root'].childIds = newDoc.elements['page-root'].childIds.filter(
      (id) => id !== 'testimonial-section',
    );

    const { commands } = diffDocs(oldDoc, newDoc, { source: 'code' });
    const kinds = commands.map((c) => c.kind);
    expect(kinds.filter((k) => k === 'remove').length).toBeGreaterThanOrEqual(1);
  });
});
