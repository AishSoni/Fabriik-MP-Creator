import { describe, expect, it } from 'vitest';
import { TEMPLATES } from './index';
import { templateDocSchema } from '../engine/validate';
import { getSubtreeIds, resolveTree } from '../engine/resolve';
import { VIEWPORTS } from '../types/viewport';

describe('built-in templates', () => {
  it('register unique ids and non-empty descriptors', () => {
    expect(TEMPLATES.length).toBeGreaterThanOrEqual(1);
    expect(new Set(TEMPLATES.map((t) => t.id)).size).toBe(TEMPLATES.length);
    for (const definition of TEMPLATES) {
      expect(definition.name.length).toBeGreaterThan(0);
      expect(definition.description.length).toBeGreaterThan(0);
    }
  });

  it.each(TEMPLATES.map((t) => [t.name, t] as const))(
    '%s fixture is structurally sound',
    (_, definition) => {
      const doc = definition.create();
      expect(templateDocSchema.safeParse(doc).success).toBe(true);

      for (const element of Object.values(doc.elements)) {
        if (element.parentId) {
          expect(doc.elements[element.parentId].childIds).toContain(element.id);
        }
        for (const childId of element.childIds) {
          expect(doc.elements[childId]?.parentId).toBe(element.id);
        }
      }

      const reachable = getSubtreeIds(doc, doc.rootId).sort();
      expect(reachable).toEqual(Object.keys(doc.elements).sort());

      for (const viewport of VIEWPORTS) {
        expect(resolveTree(doc, viewport).size).toBe(Object.keys(doc.elements).length);
      }

      const hasResponsiveOverride = Object.values(doc.elements).some(
        (element) => element.style.overrides !== undefined || element.content.overrides !== undefined,
      );
      expect(hasResponsiveOverride).toBe(true);

      expect(doc.templateId).toBe(definition.id);
    },
  );
});
