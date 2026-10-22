Assisted Chat iOS 1.0.12 (50) Codemagic release source.

Repository: ahmadalwakai/tyrerescue. Branch: release/assisted-chat-ios50-20261022.
Workflow: assisted-ios50-native. Existing personal Codemagic app: 6ad9805ca90d8e2419527279.
API trigger only, mac_mini_m2, 120 minute maximum, Node 20.19.4, Xcode 26.2 build 17C52, iOS SDK 26.2. Billing status and remaining free minutes must be verified separately before dispatch.
Reuse assisted_ios49_public for the existing public Mapbox token. Use release-scoped assisted_ios50_signing for the same existing certificate/profile, supplied only by the root release task.

Frozen application: 223 files; source manifest 0bdfd0c4640b6b541c704dee479df178ff1b187b4e460ac7487899d02503efe8; package lock 1ef71bea01739d77bd82eeae55a74670c5335a8014db44139c15df8047cd680b. The archive includes the current app source and excludes environment files, credentials, node_modules, generated native directories, tests, logs and local artifacts. No dependency pin is changed.

The source verifier checks exact byte hashes, application identity, notification patch, disabled-startup overrides, modal safe-area/lifecycle changes and animated visitor count integration. IPA verification checks signed identity, App Store provisioning, production APNs, arm64, Hermes, sounds, fixed UI marker strings, production API and configured public map token, and scans for private literals.

The build creates an IPA only. There is no publishing section, external message, App Store review or TestFlight submission. Signing material is removed by the preserved EXIT cleanup. The root task downloads and verifies the output, then submits to the existing internal TestFlight groups. No GitHub workflows are present, and Vercel Git deployment is disabled for this branch.
