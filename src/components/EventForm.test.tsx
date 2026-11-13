import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { TestApp } from '@/test/TestApp';
import { EventForm } from '@/components/EventForm';
import { createEventDraft } from '@/lib/event-authoring';

describe('Event Draft form', () => {
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
