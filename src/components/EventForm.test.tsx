import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { TestApp } from '@/test/TestApp';
import { EventForm } from '@/components/EventForm';
import { createEventDraft } from '@/lib/event-authoring';
import { draftCreationEvent, readSharedEventDrafts, StaleEventDraftError } from '@/lib/shared-event-drafts';
import { finalizeEvent, generateSecretKey } from 'nostr-tools';

describe('Event Draft form', () => {
  it('requires confirmation, cancels without deleting, and retains input after a failed deletion', async () => {
    const remove = vi.fn().mockRejectedValue(new Error('Check your relays and retry Delete draft.'));
    const success = vi.fn();
    render(<TestApp><EventForm savedDraft={{ ...createEventDraft('Europe/London'), title: 'Proposal' }} onDeleteDraft={remove} onSuccess={success} /></TestApp>);
    expect(remove).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText(/Title/), { target: { value: 'Unsaved title' } });
    fireEvent.click(screen.getByRole('button', { name: 'Delete draft' }));
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(remove).not.toHaveBeenCalled();
    expect(screen.getByLabelText(/Title/)).toHaveValue('Unsaved title');
    fireEvent.click(screen.getByRole('button', { name: 'Delete draft' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm deletion' }));
    await screen.findByText('Check your relays and retry Delete draft.');
    expect(success).not.toHaveBeenCalled();
    expect(screen.getByLabelText(/Title/)).toHaveValue('Unsaved title');
    remove.mockResolvedValue(undefined);
    fireEvent.click(screen.getByRole('button', { name: 'Confirm deletion' }));
    await waitFor(() => expect(success).toHaveBeenCalledOnce());
  });
  it('edits shared fields and retains unsaved input for reconciliation when loading the latest draft', async () => {
    const fields = { ...createEventDraft('Europe/London'), title: 'Original', content: 'Original notes' };
    const record = finalizeEvent({ ...draftCreationEvent({ ...fields, title: 'Remote title' }), created_at: 1 }, generateSecretKey());
    const latest = readSharedEventDrafts([record], [record.pubkey])[0];
    const save = vi.fn().mockRejectedValue(new StaleEventDraftError(latest));
    const load = vi.fn();
    render(<TestApp><EventForm savedDraft={fields} onSaveDraft={save} onLoadLatestDraft={load} /></TestApp>);
    expect(screen.getByLabelText(/Title/)).toBeEnabled();
    fireEvent.change(screen.getByLabelText(/Title/), { target: { value: 'My unsaved title' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save draft' }));
    await screen.findByRole('button', { name: 'Load latest draft' });
    expect(screen.getByLabelText(/Title/)).toHaveValue('My unsaved title');
    fireEvent.click(screen.getByRole('button', { name: 'Load latest draft' }));
    expect(load).toHaveBeenCalledWith(latest);
    expect(screen.getByLabelText(/Title/)).toHaveValue('Remote title');
    expect(screen.getByLabelText<HTMLTextAreaElement>('Your unsaved fields').value).toContain('My unsaved title');
    expect(screen.getByLabelText('Timezone')).toHaveTextContent('Europe/London');
  });
  it('reopens saved fields including their timezone without publishing or consuming', () => {
    const fields = { ...createEventDraft('Europe/London'), title: 'Shared proposal', startDate: '', content: 'Keep these notes' };
    const success = vi.fn();
    render(<TestApp><EventForm savedDraft={fields} onSuccess={success} onCancel={() => {}} /></TestApp>);
    expect(screen.getByLabelText(/Title/)).toHaveValue('Shared proposal');
    expect(screen.getByLabelText(/Full Description/)).toHaveValue('Keep these notes');
    expect(screen.getByLabelText('Timezone')).toHaveTextContent('Europe/London');
    expect(screen.getByLabelText(/Start Date/)).toHaveValue('');
    expect(screen.queryByRole('button', { name: 'Publish Event' })).not.toBeInTheDocument();
    expect(success).not.toHaveBeenCalled();
  });
  it('saves with only a title and retains input when saving fails', async () => {
    const save = vi.fn().mockRejectedValue(new Error('Relay unavailable'));
    const success = vi.fn();
    render(<TestApp><EventForm onSaveDraft={save} onSuccess={success} /></TestApp>);
    fireEvent.change(screen.getByLabelText(/Title/), { target: { value: 'Unscheduled proposal' } });
    for (const label of ['Start Date', 'Start Time', 'End Date', 'End Time']) {
      fireEvent.change(screen.getByLabelText(new RegExp(label)), { target: { value: '' } });
    }
    fireEvent.click(screen.getByRole('button', { name: 'Save draft' }));
    await waitFor(() => expect(save).toHaveBeenCalledWith(expect.objectContaining({ title: 'Unscheduled proposal', startDate: '', startTime: '' })));
    expect(screen.getByLabelText(/Title/)).toHaveValue('Unscheduled proposal');
    expect(success).not.toHaveBeenCalled();
    save.mockResolvedValue(undefined);
    fireEvent.click(screen.getByRole('button', { name: 'Save draft' }));
    await waitFor(() => expect(success).toHaveBeenCalledOnce());
  });
});
