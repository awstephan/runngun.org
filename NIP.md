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

Each Trusted Admin may publish an addressable record with `d=runngun-event-templates`. Its `content` is a JSON array of that author's shared Schedule Event templates.
