# TyreRescue Stripe webhooks

Verified on 21 October 2026 (Europe/London).

## Production destination

- Name: **TyreRescue + Assisted Chat — Production**
- URL: `https://www.tyrerescue.uk/api/stripe/webhook`
- Stripe destination ID: `we_1USmjI44BBtmvWRLZAHW6wih`
- Shared backend: Next.js 16.2 / Node.js 24 on Vercel project `tyrerescue`.
- The signing secret is the Production **Secret** variable `STRIPE_WEBHOOK_SECRET` in Vercel. It is server-only. Never put its value in this document, source control, public environment variables, or mobile configuration.
- The existing **Isle of Skye Tyres Payments** destination (`we_1USmF244BBtmvWRLMOG6XncB`) and its events were preserved.

Enabled events, matching the server handlers:

```
checkout.session.completed
checkout.session.async_payment_succeeded
checkout.session.async_payment_failed
checkout.session.expired
payment_intent.succeeded
payment_intent.payment_failed
```

The configured production key authenticated successfully. Stripe reported `charges_enabled`, `payouts_enabled`, and `details_submitted` as true before destination creation. No account capabilities were changed.

## Payment ownership and confirmation

New sessions/intents carry `project=tyrerescue`, `source=website|assisted_chat|admin`, booking ID/reference, purpose, amount and currency. Checkout session metadata is also written to the underlying PaymentIntent. Legacy events without project metadata require an exact existing server-side payment/session association.

The handler verifies the raw request body and `Stripe-Signature`, checks live/test mode and project ownership, then validates booking/reference, stored transaction, expected GBP amount and received amount. Other projects are acknowledged without fulfillment. Booking, receipt and payment updates share a locked PostgreSQL transaction. Existing database uniqueness constraints deduplicate event IDs and successful intent receipts. Inventory commitment locks the booking before checking its sale marker.

Missing server configuration returns 503; invalid signatures return 400; transient Stripe/database/inventory failures return 500 so Stripe can retry. Declined cards preserve the payable booking and reservation. A second payment after settlement, payment for a cancelled booking, or a second distinct deposit requires operator review.

Website confirmation, protected Assisted Chat checking, and scheduled reconciliation use the same transactional validation. The browser redirect alone cannot mark a booking paid. Mobile configuration contains only the API origin and public assets; it contains no Stripe secret or webhook secret.

Payment creation reuses open sessions and retryable intents under server locks. Expired/cancelled attempts receive deterministic successor keys. Public quote retries resume the saved booking and price. Reservation IDs belong to the quote, so retries cannot claim or release another quote's stock.

## Verification evidence

- 89 focused payment/security tests passed in the working tree; 75 applicable backend tests also passed on the release snapshot based on the previous production commit.
- Local signature tests use the Stripe SDK's generated signature. They cover tampering, missing secrets, transient failures, other projects/modes, and asynchronous payment settlement. These are local signing tests, not proof of Stripe delivery.
- Actual Stripe **test-mode** failure and success events were delivered through a temporary HTTPS tunnel to the real server route against isolated Neon branch `br-floral-hat-adkqaru5`. The same test intent failed, was retried, and succeeded; its synthetic booking became paid at the unchanged amount of £12.34.
- Final real event IDs: failure `evt_3USmnN44BBtmvWRL1vFspNV3`; success `evt_3USmnN44BBtmvWRL1OIOUTnq`. Both were retrieved from Stripe to verify provenance. No live card was charged.
- Real SQL tests confirmed concurrent deduplication, one inventory deduction, retry/expiry behavior, global intent ownership, settlement review and recovery from legacy partial confirmation.
- Test outbound email/SMS/push delivery was blocked. Customer bookings were not modified. The temporary test destination was disabled and the tunnel/listener stopped after verification. The isolated database branch is retained for audit and suspends its compute when idle.
- The general working-tree suite has 1424 passing tests and 9 unrelated failures in existing design/startup/pricing/SEO/advertising assertions. The payment suites pass.

## Release records

The server release applies only payment changes to production commit `dd695eec136548319dcb434d4aa09581dfaba93c`, preserving newer production integration and security code. Candidate deployment: `dpl_EgWVBxco4Av5cjc1wRZt5PiGk26z`.

Assisted Chat iOS version **1.0.12 (45)** was built and uploaded to Apple successfully. Apple reports `VALID` and `IN_BETA_TESTING`; build 45 is selected in the existing App Store draft. Public App Store availability is distinct from TestFlight delivery.

- [iOS build](https://expo.dev/accounts/ahmadawadalwakai/projects/tyre-rescue-assisted-chat/builds/b816aa6a-851e-4905-b7b1-33445c78a60f)
- [Apple submission](https://expo.dev/accounts/ahmadawadalwakai/projects/tyre-rescue-assisted-chat/submissions/3741b1fe-8a66-423c-8d09-202c11248da2)
- [Prepared App Store version](https://appstoreconnect.apple.com/apps/6786223270/distribution/ios/version/74575f25-73fa-444f-8165-fb0ab61f7aef)

Deployment validation and remaining App Store prerequisites are recorded after the final production checks.
