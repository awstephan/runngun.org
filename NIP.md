# Run & Gun Application Data

This document defines the application-specific kind `30078` records used by runngun.org under NIP-78. Consumers MUST identify each record by its author and `d` tag.

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
