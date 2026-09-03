import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FileMenu, IMPORT_SAVE_FIRST_MESSAGE } from './FileMenu';
import { useTemplateStore } from '../../store/templateStore';
import { useEditorStore } from '../../store/editorStore';
import { createDefaultTemplate } from '../../template/defaultTemplate';
import { downloadFile } from '../../lib/download';

vi.mock('../../lib/download', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/download')>()),
  downloadFile: vi.fn(),
}));

const downloadFileMock = vi.mocked(downloadFile);

const importedDoc = () => {
  const doc = JSON.parse(JSON.stringify(createDefaultTemplate()));
  doc.templateId = 'tpl-imported-x1';
  doc.templateName = 'Imported Template';
  return doc;
};

const envelopeFor = (doc: unknown) =>
  JSON.stringify({
    format: 'fabriik-template',
    version: 1,
    exportedAt: '2026-01-01T00:00:00.000Z',
    doc,
  });

const jsonFile = (contents: string) =>
  new File([contents], 'import.json', { type: 'application/json' });

beforeEach(() => {
  localStorage.clear();
  useTemplateStore.getState().loadTemplate('tpl-landing-v1');
  useEditorStore.getState().setToastMessage(null);
  downloadFileMock.mockClear();
});

describe('FileMenu', () => {
  it('opens and closes the menu from the Fabriik trigger', async () => {
    const user = userEvent.setup();
    render(<FileMenu />);
    const trigger = screen.getByTestId('file-menu-trigger');
    expect(trigger).toHaveTextContent('Fabriik');
    expect(trigger).toHaveAttribute('aria-haspopup', 'menu');

    await user.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('menu', { name: 'Template file actions' })).toBeInTheDocument();

    await user.keyboard('{Escape}');
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('exports the current doc as a versioned JSON envelope', async () => {
    const user = userEvent.setup();
    render(<FileMenu />);
    await user.click(screen.getByTestId('file-menu-trigger'));
    await user.click(screen.getByTestId('menu-export-json'));

    expect(downloadFileMock).toHaveBeenCalledOnce();
    const [filename, mime, contents] = downloadFileMock.mock.calls[0];
    expect(filename).toBe('landing-page.json');
    expect(mime).toBe('application/json');
    expect(String(contents)).toContain('"fabriik-template"');
    expect(useEditorStore.getState().toastMessage).toBe('Exported landing-page.json');
  });

  it('exports the current page as a standalone HTML document', async () => {
    const user = userEvent.setup();
    render(<FileMenu />);
    await user.click(screen.getByTestId('file-menu-trigger'));
    await user.click(screen.getByTestId('menu-export-html'));

    expect(downloadFileMock).toHaveBeenCalledOnce();
    const [filename, mime, contents] = downloadFileMock.mock.calls[0];
    expect(filename).toBe('landing-page.html');
    expect(mime).toBe('text/html');
    expect(String(contents)).toContain('<!doctype html>');
    expect(useEditorStore.getState().toastMessage).toBe('Exported landing-page.html');
  });

  it('offers to save first and exports before opening the file picker', async () => {
    const user = userEvent.setup();
    const confirmSpy = vi
      .spyOn(window, 'confirm')
      .mockReturnValueOnce(true)
      .mockReturnValueOnce(true);
    render(<FileMenu />);
    await user.click(screen.getByTestId('file-menu-trigger'));
    await user.click(screen.getByTestId('menu-import'));

    expect(confirmSpy).toHaveBeenNthCalledWith(1, IMPORT_SAVE_FIRST_MESSAGE);
    expect(downloadFileMock).toHaveBeenCalledOnce();
    expect(downloadFileMock.mock.calls[0][0]).toBe('landing-page.json');

    await user.upload(screen.getByTestId('file-menu-input'), jsonFile(envelopeFor(importedDoc())));
    await waitFor(() =>
      expect(useTemplateStore.getState().doc.templateId).toBe('tpl-imported-x1'),
    );
    expect(confirmSpy).toHaveBeenNthCalledWith(
      2,
      'Import “Imported Template”? Your current edits and revision history will be discarded.',
    );
    expect(useTemplateStore.getState().history).toEqual({});
    expect(useTemplateStore.getState().activeTemplateId).toBe('tpl-imported-x1');
    expect(useEditorStore.getState().toastMessage).toBe('Imported “Imported Template”');
    confirmSpy.mockRestore();
  });

  it('skips the save-first export when the prompt is declined', async () => {
    const user = userEvent.setup();
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
    render(<FileMenu />);
    await user.click(screen.getByTestId('file-menu-trigger'));
    await user.click(screen.getByTestId('menu-import'));

    expect(confirmSpy).toHaveBeenCalledOnce();
    expect(downloadFileMock).not.toHaveBeenCalled();
    confirmSpy.mockRestore();
  });

  it('declining the apply prompt keeps the current doc', async () => {
    const user = userEvent.setup();
    const confirmSpy = vi
      .spyOn(window, 'confirm')
      .mockReturnValueOnce(false)
      .mockReturnValueOnce(false);
    render(<FileMenu />);
    await user.click(screen.getByTestId('file-menu-trigger'));
    await user.click(screen.getByTestId('menu-import'));
    await user.upload(screen.getByTestId('file-menu-input'), jsonFile(envelopeFor(importedDoc())));

    await waitFor(() => expect(confirmSpy).toHaveBeenCalledTimes(2));
    expect(useTemplateStore.getState().doc.templateId).toBe('tpl-landing-v1');
    expect(useTemplateStore.getState().lastErrors).toEqual([]);
    confirmSpy.mockRestore();
  });

  it('surfaces validation errors for invalid files without touching the doc', async () => {
    const user = userEvent.setup();
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<FileMenu />);
    await user.click(screen.getByTestId('file-menu-trigger'));
    await user.click(screen.getByTestId('menu-import'));
    await user.upload(screen.getByTestId('file-menu-input'), jsonFile('{ not json'));

    await waitFor(() =>
      expect(useTemplateStore.getState().lastErrors.length).toBeGreaterThan(0),
    );
    expect(useTemplateStore.getState().doc.templateId).toBe('tpl-landing-v1');
    expect(useEditorStore.getState().toastMessage).toBeNull();
    confirmSpy.mockRestore();
  });
});
