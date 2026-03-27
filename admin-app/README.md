# Tyre Rescue Admin App

Internal Android admin app built with Expo Router + TypeScript.

## Environment

Set API base URL before running:

- `EXPO_PUBLIC_API_BASE_URL=http://<your-lan-ip>:3000`

## Commands

- `npm install`
- `npm run start`
- `npm run android`
- `npm run typecheck`

## Notes

- Uses mobile bearer auth endpoints under `/api/mobile/admin/*`.
- Secure storage keys are isolated from driver-app keys.
