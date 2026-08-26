import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { PropertiesPanel } from './components/panels/PropertiesPanel';
import { useTemplateStore } from './store/templateStore';
import { useEditorStore } from './store/editorStore';

beforeEach(() => {
  localStorage.clear();
  useTemplateStore.getState().resetDoc();
  useEditorStore.getState().clearSelection();
});

describe('PropertiesPanel nav links editing', () => {
  it('round-trips label :: href lines through the command pipeline', async () => {
    const user = userEvent.setup();
    useEditorStore.getState().selectOnly('top-nav');
    render(<PropertiesPanel />);

    const box = screen.getByLabelText('Navigation links');
    expect(box).toHaveValue('Features :: #features\nPricing :: #pricing\nAbout :: #about');

    await user.clear(box);
    await user.type(box, 'Menu :: #menu\nReservations :: #book');
    await user.tab();

    const content = useTemplateStore.getState().doc.elements['top-nav'].content.base as {
      brand: string;
      links: { label: string; href: string }[];
    };
    expect(content.brand).toBe('Landing');
    expect(content.links).toEqual([
      { label: 'Menu', href: '#menu' },
      { label: 'Reservations', href: '#book' },
    ]);
    expect(useTemplateStore.getState().history['top-nav'].length).toBeGreaterThan(0);
  });

  it('drops blank lines and defaults missing hrefs', async () => {
    const user = userEvent.setup();
    useEditorStore.getState().selectOnly('top-nav');
    render(<PropertiesPanel />);

    const box = screen.getByLabelText('Navigation links');
    await user.clear(box);
    await user.type(box, 'Only Label Here');
    await user.tab();

    const content = useTemplateStore.getState().doc.elements['top-nav'].content.base as {
      links: { label: string; href: string }[];
    };
    expect(content.links).toEqual([{ label: 'Only Label Here', href: '#' }]);
  });
});


