# Run & Gun

Run & Gun publishes and administers the trusted schedule of community events on Nostr.

## Language

**Site Owner**:
The identity that appoints and revokes Trusted Admins by publishing the authoritative admin document. The Site Owner is inherently a Trusted Admin.
_Avoid_: Super admin, root admin

**Trusted Admin**:
The Site Owner or an identity currently appointed by the Site Owner to publish, edit, and remove schedule events and shared event templates. Only the Site Owner appoints and revokes Trusted Admins. Content from a revoked identity, including previously published content, is no longer trusted. A valid owner-authored Nostr document is authoritative; the last validated set is a stale availability fallback when that document cannot be obtained.
_Avoid_: Default admin, stored admin, legacy admin
