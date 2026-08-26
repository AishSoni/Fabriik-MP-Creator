import type { TemplateDoc } from '../types/template';
import { createDefaultTemplate } from './defaultTemplate';
import { createPortfolioTemplate } from './portfolioTemplate';

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
  {
    id: 'tpl-portfolio-v1',
    name: 'Creative Portfolio',
    description: 'Dark personal portfolio with work cards, skills list and contact CTA.',
    create: createPortfolioTemplate,
  },
];

export function getTemplateById(id: string): TemplateDefinition | undefined {
  return TEMPLATES.find((definition) => definition.id === id);
}
