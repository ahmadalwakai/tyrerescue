# Admin confirmation of inferred driver journeys

The server compares fresh, identified Online driver GPS with today's open
bookings in Europe/London. All booking origins and types participate, including
unassigned bookings and administrator-created bookings. No observation changes
payment, price, stock, booking status, assignment, or customer tracking.

## Operator flow

1. The driver remains Online and permits location sharing. A booking reference
   is not required for native background uploads.
2. Repeated location evidence suggests a driver is approaching a booking or is
   already nearby. The server stores a proposal and sends an iPhone push.
3. Opening the notification fetches the authenticated current event and opens
   Assisted Chat's **Driver journeys** popup. The admin answers **Yes** or **No**.
4. Yes enables admin-only journey monitoring. No suppresses that driver/booking
   pair for the rest of the London service day. Multiple admins cannot save
   conflicting answers. Old, stale or cancelled proposals cannot be confirmed.
5. A confirmed journey can produce a push when road ETA is five minutes or less
   and when a continuous stop exceeds two minutes. The feed retains the event
   and displays current GPS/ETA information. Monitoring ends on arrival, work
   starting, cancellation, completion or the next London service day.

The feed is separate from existing booking alerts. Notification content selects
an event ID; it never authorises a decision or supplies trusted booking details.

## Evidence and limits

- Candidate evidence spans at least 30 seconds. Approach proposals require
  meaningful progress and heading alignment within 20 km. Moving nearby
  proposals are within 500 m. Stationary nearby proposals require tighter
  accuracy (25 m), stability and a distance of 150 m or less.
- Inference requires genuine, increasing GPS sample timestamps, age no more
  than 60 seconds and accuracy of 50 m or better. Implausible jumps are rejected.
- Road ETA comes from the existing Mapbox driving service, at most once per
  minute per confirmed journey. Two genuine ETA checks at or below 300 seconds
  are needed. A missing route never becomes a straight-line ETA estimate.
- Stops require previous travel, continuous samples no more than 60 seconds
  apart, a stable 25 m area and low/unknown speed. Arrival within 75 m suppresses
  stop alerts. Missing GPS is never evidence that a driver has stopped.
- Native requests ask for stationary updates every 20 seconds. iOS/Android
  control actual background delivery. Force quit, missing permissions, battery
  restrictions or connectivity may interrupt evidence and delay/miss an alert.
- Suggestions expire after ten minutes. Unanswered expired suggestions can be
  proposed again after a 15-minute cooldown, using a new immutable event ID.
  An explicit No remains suppressed for that day.
- Durable driver leases, observation revisions and unique event keys prevent
  duplicate inference/events across server instances. External sends have
  durable claims, bounded transport waits and up to three attempts when no
  iPhone relay ticket was accepted. Retries require the condition still to be
  current. Partial success is not broadcast again to already accepted devices.
  Relay acceptance does not prove APNs/device delivery.

## Release status and remaining device checks

The authorised 21 October 2026 release applied `0029_driver_journey_monitor.sql`
to production, deployed the server evaluator/routes, and delivered Assisted Chat
1.0.12 (46) to internal TestFlight. The new server is live on www.tyrerescue.uk;
see [the release record](releases/tyrerescue-production-2026-10-21.md).
The corresponding driver native app was not built by this release. Driver
background GPS changes require that app update if the installed driver version
does not already report Online unassigned-driver GPS.

For subsequent deployments and physical verification:

- Apply `0029_driver_journey_monitor.sql` to the target environment using the
  normal migration process. It adds three admin-only tables and indexes.
- Deploy the server routes and evaluator, with the existing protected Mapbox
  credentials and admin iOS push registration configured.
- Release updated Assisted Chat and driver apps. Driver native permission
  descriptions changed; existing installed binaries do not gain that wording.
- Verify on physical iPhones with isolated driver/admin accounts and synthetic
  bookings: locked admin phone, Online unassigned driver, Maps in foreground,
  Yes/No, cancellation, approach, stop, resumed travel, lost GPS and Offline.

No customer mutation or real push was performed during development or release
verification. Local checks include 289 Vitest
tests, 19 native-module VM tests and ten in-memory PostgreSQL scenarios with
Mapbox and notification transports replaced. Both apps and the scoped server
TypeScript program pass. Actual phone delivery remains unverified.
