# Run & Gun Application Data

This document defines runngun.org application data: addressable kind `30078` documents under NIP-78 and public shared Event Draft records of regular kind `3523`. Consumers MUST identify addressable documents by author and `d` tag, and drafts by their signed creation event ID.

## Location Resolutions

The Site Owner publishes the addressable record with `d=runngun-geolocations`. Its `content` is a JSON array of normalized location strings for human inspection; tags are authoritative.

Each curated resolution uses:

```json
["location", "<normalized location>", "<latitude>", "<longitude>", "<exact|approximate>"]
```

- Latitude MUST be finite and between `-90` and `90`.
- Longitude MUST be finite and between `-180` and `180`.
- Precision is `exact` or `approximate`.
- The event SHOULD include `["alt", "runngun.org location resolutions"]`.

Legacy records used `["g", "<location>", "<latitude>", "<longitude>"]`. Readers may interpret these as exact resolutions, but publishers MUST use the `location` tag because the standard Nostr `g` tag contains a geohash rather than custom coordinate fields.

## Trusted Admins

The Site Owner publishes the addressable record with `d=runngun-admin-list`. Its `content` is a JSON array of additional Trusted Admin pubkeys. The Site Owner is implicit and need not appear in the array.

## Event Templates

Each Trusted Admin may publish an addressable record with `d=runngun-event-templates`. Its `content` is a JSON array of that author's shared Event Templates. The event author owns every template in their document; clients MUST NOT copy another author's document when saving or deleting templates.

Each template object contains:

```json
{
  "id": "<unique string within the author's document>",
  "name": "<display name>",
  "title": "<Schedule Event title>",
  "summary": "<short summary>",
  "content": "<description>",
  "location": "<human-readable location>",
  "image": "<image URL>",
  "price": "<human-readable price>",
  "links": ["<URL>"]
}
```

Occurrence dates, times, and timezone are intentionally excluded and MUST be initialized when applying a template to a new Schedule Event draft.

## Shared Event Drafts (kind 3523, version 1)

Event Drafts use regular, independently signed records of kind `3523` (allocated
after reviewing the NIP kind registry). They are public proposals, never ordinary
NIP-52 occurrences. The public schedule continues to query kind `31923` only.

### Protocol choice

- NIP-37 (`31234`, checkpoints `1234`) encrypts to the signer and recommends
  private storage; it cannot provide public cross-admin access.
- NIP-78 (`78`, `30078`) recommends authenticated, owner-only retrieval. Existing
  application documents use it, but it is not a public draft storage contract.
- NIP-23's old article draft is deprecated and self-encrypted; NIP-54 describes
  competing encyclopedia articles rather than shared proposals with immutable
  creation provenance. NIP-52 requires complete occurrences and has no draft kind.
- NIP-09 only deletes the requester's own events; it cannot dismiss another
  admin's draft. Addressable replacement is likewise scoped to the signing author.
- Regular NIP-01 records preserve independently signed history, including earlier
  trusted revisions needed after contributor revocation. No new kind is needed
  for each operation: operations share the same record schema and use tags.

### Creation (implemented)

Required tags: `['t', 'runngun-event-draft']`, `['version', '1']`,
`['op', 'create']`, and a nonblank `['title', '<entered title>']`.
Publishers include `['d', '<random UUID>']` for distinct creations, and the
NIP-31 `['alt', 'Public Run & Gun Event Draft']` description. The `d` tag does
not make this regular kind replaceable or determine draft identity.

**The signed creation event ID is the stable draft identity; its verified pubkey
is the original creator.** No claimed `creator` tag or later contributor may
replace that identity. Creation records must not contain `e` references.

The `content` field is the entered freeform description. Scalar tags preserve
`title`, `summary`, `location`, `image`, `price`, `start_date`, `start_time`,
`end_date`, `end_time`, and `start_tzid` (the form's declared IANA timezone).
Repeated `r` tags preserve entered links in order, including incomplete links.
Missing scalar fields read as empty strings; duplicate scalar/version/operation
tags are invalid. Empty date/time fields are valid. Civil date/time strings are
stored as entered, without converting an incomplete proposal to timestamps.
Only a nonblank title is required to save; NIP-52 validation belongs to publication.

Discovery filters by kind, topic, and the authoritative current Trusted Admin
authors, then validates signatures, schema, and creator trust again locally.
Results are deduplicated by creation ID and ordered by descending `created_at`,
then ascending event ID. No logged-in account owns the shared list. Revoking the
creator hides the entire unpublished proposal. This first slice accepts creation
records only and reopens them read-only; subsequent operations below are reserved
for the remaining tickets, not interpreted by this implementation.

### Follow-up operation contract

Each future revision, dismissal, or consumption is a new kind `3523` record signed
by its actual contributor, with the same topic/version and an `op` of `revise`,
`delete`, or `consume`. An `e` tag with marker `root` references the exact signed
creation event ID; revisions also reference the loaded base event with marker
`previous`. Readers must fetch and validate that creation, not infer a creator
from contributor-supplied metadata. Revisions carry a full field snapshot.

Only currently trusted contributions to a currently trusted creation count.
Revisions order by descending timestamp, then ascending ID; base references
record observed ancestry, not a promise of atomic conflict prevention. Refresh
before saving/publishing and preserve unsaved input on stale edits.

A valid trusted `delete` or `consume` suppresses the root regardless of later
content revisions. Revoking a contributor removes their actions from consideration,
possibly revealing an earlier revision or undoing dismissal. Publication must put
an `e` root provenance reference on the publisher-signed kind `31923` event so that
a visible publication consumes the root even if the follow-up `consume` write
fails. Consumption should also reference that publication. Published ownership
and trust follow its signer independently of draft-creator trust. Simultaneous
publications can produce duplicates; there are no locks or approval state.

### Relay availability

A kind number does not guarantee relay retention or public access. Saving first
publishes using the connected signer and configured write relays, then opens
separate **unauthenticated** connections to configured read/write relays. At
least one must return the exact signed creation through a kind/author/topic/ID
query before the UI reports success. Connections are closed after bounded queries.
An accepted write without anonymous readback is shown as unverified, retaining
the form. The signed creation is retained before transmission, even when the
write acknowledgment fails. Retrying resends that same signed record to current
write relays and rechecks public access. If fields changed, the previous save is
reconciled first; the new input remains in the form and requires a separate Save
draft click to create another proposal. Pending retries last for the mounted
workspace; after leaving it, refresh the shared list before recreating a proposal
whose write outcome was uncertain.

Other admins must have a read relay in common with a relay holding the record;
no client can guarantee propagation or permanent retention on arbitrary relays.
The admin list refreshes every 30 seconds and on focus, and offers an explicit
refresh of authority and drafts. Discovery is bounded to 1000 records for this
low-volume workspace. Public-read verification is performed per save against the
user's actual relay configuration, rather than inferred from NIP support claims.
