import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { LayersPanel } from './LayersPanel';
import { useTemplateStore } from '../../store/templateStore';
import type { TemplateDoc } from '../../types/template';

/** Placeholder doc a joiner holds before the room sync arrives (no root element). */
const blankRoomDoc: TemplateDoc = {
  templateId: 'tpl-empty',
  templateName: 'Untitled',
  revision: 0,
  rootId: 'page-root',
  elements: {},
};

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  useTemplateStore.getState().loadTemplate('tpl-landing-v1');
});

describe('LayersPanel', () => {
  it('lists the hydrated template sections', () => {
    render(<LayersPanel />);

    expect(screen.getByRole('complementary', { name: 'Layers' })).toBeInTheDocument();
    expect(screen.getByText(/\d+ sections/)).toBeInTheDocument();
    expect(screen.getAllByRole('listitem').length).toBeGreaterThan(0);
  });

  it('renders the blank multiplayer placeholder without crashing and shows a syncing state', () => {
    useTemplateStore.setState({ doc: blankRoomDoc });

    render(<LayersPanel />);

    expect(screen.getByText('Syncing…')).toBeInTheDocument();
    expect(screen.queryByText(/\d+ sections/)).not.toBeInTheDocument();
    expect(screen.queryAllByRole('listitem')).toHaveLength(0);
  });
});
