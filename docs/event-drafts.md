# Shared Event Drafts

Status: agreed design; implementation pending.

## Purpose

One Trusted Admin can prepare an Event Draft and another can edit and publish it under their own Nostr identity. Automated creators are ordinary Trusted Admin identities; bot generation and operation are outside this feature.

## Workflow

- Show shared drafts under the existing admin **Events** tab, clearly marked **Draft**. Drafts do not appear as published Schedule Events on the public schedule.
- Selecting a draft opens the event form for editing. Opening it alone does not consume it.
- Offer **Save draft** during ordinary new-event creation and when editing a draft.
- Saving requires a title but permits incomplete event details, including missing venue or start time.
- Offer **Save draft**, **Publish**, and **Delete** for an existing draft. Use no approval terminology or separate approval step.
- Publishing requires complete, valid Schedule Event data, preserving existing timezone and event validation rules.
- The publishing admin signs the Schedule Event with their own account. Publication consumes the draft, removing it from every admin's active draft list after synchronization.
- Confirm deletion, then remove the draft from the shared workspace for everyone after synchronization. There is no restore interface initially.
- Drafts cover new Schedule Events only. Published events retain the existing author-owned editing workflow.

## Visibility and authority

- Draft records are publicly readable on Nostr; private encryption is unnecessary for these intended public events.
- Only current Trusted Admins create drafts or contribute edits, publication, or deletion actions. Any Trusted Admin may act on any draft.
- Retain the original creator identity across edits. If that creator is revoked, their unpublished drafts disappear even if other admins edited them.
- Revoked contributors' edits and deletions stop counting. This may expose an earlier revision or cause a deleted draft to reappear while its original creator remains trusted.
- Published Schedule Events are governed by the publisher's trust status, rather than the draft creator's status.
- Deletion means removal from the application's shared workspace, not guaranteed erasure of public records from relays.

## Low-volume concurrency

- Check for newer saved changes before overwriting a draft. When detected, ask the editor to load the latest version and preserve their unsaved text for reconciliation.
- Refresh draft state before publishing to detect an already-consumed draft.
- Simultaneous publication may still produce two independently signed Schedule Events. This rare possibility is accepted; one publisher can delete their duplicate manually.
- Do not introduce a coordinating service, distributed locking, or an elaborate merge interface for this low-volume workflow.

## Implementation boundary

The storage schema and event kinds have not been selected. Cross-author editing and removal must be represented as authorized application actions, rather than assuming an admin can replace or delete another author's signed Nostr event. Document the chosen schema in `NIP.md` during implementation, after checking applicable NIPs and relay behavior.

See [the shared-draft authority decision](adr/0004-share-drafts-without-transferring-event-ownership.md).
