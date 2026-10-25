#!/bin/bash
set -euo pipefail
test -z "${CUSTOMER_IOS_P12_BASE64:-}" && test -z "${CUSTOMER_IOS_P12_PASSWORD:-}" && test -z "${CUSTOMER_IOS_PROFILE_BASE64:-}" && test -z "${CM_API_TOKEN:-}"
cd "$CM_BUILD_DIR/$CUSTOMER_APP_DIR"
# Expo normally creates this ignored declaration when the dev server starts.
# A clean CI checkout needs it before the first typecheck.
printf '/// <reference types="expo/types" />\n' > expo-env.d.ts
npx --no-install tsc --noEmit
# Self-contained tests do not load the admin app test harness.
node --test scripts/customer-apple-pay.test.cjs scripts/customer-active-booking.test.cjs scripts/customer-booking-design.test.cjs scripts/customer-review.test.cjs scripts/customer-location.test.cjs scripts/customer-location-store.test.cjs scripts/customer-payment.test.cjs scripts/customer-payment-redirect.test.cjs scripts/customer-payment-return-provider.test.cjs scripts/customer-payment-recovery.test.cjs scripts/customer-payment-recovery-native.test.cjs scripts/customer-payment-step.test.cjs
