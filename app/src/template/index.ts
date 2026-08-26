import type { TemplateDoc } from '../types/template';
import { createDefaultTemplate } from './defaultTemplate';

export interface TemplateDefinition {
  id: string;
  name: string;
  description: string;
  create: () => TemplateDoc;
}

export const TEMPLATES: TemplateDefinition[] = [
  {
    id: 'tpl-landing-v1',
    name: 'Landing Page',
    description: 'Classic product landing page (adapted from Tailwind Toolbox, MIT).',
    create: createDefaultTemplate,
  },
];

export function getTemplateById(id: string): TemplateDefinition | undefined {
  return TEMPLATES.find((definition) => definition.id === id);
}
