# Run & Gun

Run & Gun publishes and administers the trusted schedule of community events on Nostr.

## Language

**Site Owner**:
The identity that appoints and revokes Trusted Admins by publishing the authoritative admin document. The Site Owner is inherently a Trusted Admin.
_Avoid_: Super admin, root admin

**Trusted Admin**:
The Site Owner or an identity currently appointed by the Site Owner to publish Schedule Events and Event Templates, and to edit or remove the ones they authored. Only the Site Owner appoints and revokes Trusted Admins. Content from a revoked identity, including previously published content, is no longer trusted. A valid owner-authored Nostr document is authoritative; the last validated set is a stale availability fallback when that document cannot be obtained.
_Avoid_: Default admin, stored admin, legacy admin

**Schedule Event**:
A trusted, time-based Run & Gun occurrence explicitly categorized for the Run & Gun schedule. It is upcoming before its start, in progress from its inclusive start until its exclusive end, and past afterward; without an end it is instantaneous.
_Avoid_: Calendar item, race listing

**Location Resolution**:
The coordinates assigned to a normalized Schedule Event location, with exact or approximate precision. A Site Owner-published resolution is curated truth; browser persistence and external geocoding provide fallback discovery only.
_Avoid_: Geocode cache entry, map location

**Event Template**:
A reusable starting point for authoring a Schedule Event. It is shared with current Trusted Admins but owned, updated, and removed only by the Trusted Admin who created it.
_Avoid_: Event preset, shared form
