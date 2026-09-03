import type { TemplateDoc } from '../types/template';
import { createDefaultTemplate } from './defaultTemplate';
import { createPortfolioTemplate } from './portfolioTemplate';
import { createSaasTemplate } from './saasTemplate';
import { createBistroTemplate } from './bistroTemplate';
import { createEditorialTemplate } from './editorialTemplate';
import { createBrutalistTemplate } from './brutalistTemplate';
import { createHorizonTemplate } from './horizonTemplate';

export interface TemplateDefinition {
  id: string;
  name: string;
  description: string;
  create: () => TemplateDoc;
}

export const TEMPLATES: TemplateDefinition[] = [
  {
    id: 'tpl-editorial-v1',
    name: 'Editorial Atelier',
    description: 'Warm bento magazine — asymmetric cards, archive list and seasonal subscription.',
    create: createEditorialTemplate,
  },
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
  {
    id: 'tpl-saas-v1',
    name: 'SaaS Launch',
    description: 'Indigo SaaS landing with capability cards, pricing tiers and testimonial.',
    create: createSaasTemplate,
  },
  {
    id: 'tpl-bistro-v1',
    name: 'Neighborhood Bistro',
    description: 'Warm restaurant page with story, weekly menu cards and reservation CTA.',
    create: createBistroTemplate,
  },
  {
    id: 'tpl-noir-v1',
    name: 'Noir Signal',
    description: 'Brutalist type system conference — sharp grid, mono labels and caution yellow.',
    create: createBrutalistTemplate,
  },
  {
    id: 'tpl-horizon-v1',
    name: 'Horizon Retreat',
    description: 'Twilight boutique retreat — immersive imagery, coastal cabins and quiet nights.',
    create: createHorizonTemplate,
  },
];

export function getTemplateById(id: string): TemplateDefinition | undefined {
  return TEMPLATES.find((definition) => definition.id === id);
}
