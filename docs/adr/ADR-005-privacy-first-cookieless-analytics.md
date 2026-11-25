# ADR-005: Privacy-First Cookieless Analytics

> **Rule of thumb:** Portal analytics are cookieless: a visitor is a daily-salted `sha256(IP)` hash; never store user ids, cookies or other persistent identifiers for portal visitors.

**Date:** 2026-03-14 | **Status:** Accepted

**Context:** The public portal needs analytics to show companies which manuals are viewed. However, tracking users with cookies mandates GDPR/ePrivacy cookie banners, which severely harms the UX of a document portal and causes data loss when users reject consent. We needed a way to track "Unique Visitors" without storing PII or setting tracking cookies.

**Decision:**
- Adopt a cookieless, privacy-by-design tracking architecture.
- Remove `user_id` from `manual_views`.
- Implement a backend endpoint (`POST /api/v1/analytics/view`) that calculates a `hashed_identifier` using `sha256(IP_Address + Daily_Random_Salt)`.
- The salt rotates daily (or weekly) to ensure the hash cannot be used for long-term tracking or re-identification.
- Remove AI chat logging from public portals for now, as linking chat messages to an individual over time requires a persistent identifier (deferred to future implementation using ephemeral session IDs).

**Consequences:**
- Avoids the need for intrusive cookie banners on the public portal.
- "Unique Visitors" are strictly defined as *daily* unique IPs. If a user visits on Monday and Tuesday, they count as two unique visitors.
- If multiple employees behind a corporate NAT access the portal, they appear as a single unique visitor.
- Long-term user retention metrics cannot be computed.
- Architecture is future-proofed; if requirements change, a fallback cookie-based approach is documented in `docs/future/analytics-cookies.md`.
