# Polis iOS client

This is a bundled Vite/React application hosted by Capacitor. It does not load
the production website as its application shell.

## Configure

Copy `.env.example` to `.env.local` and set only public mobile values:

- `VITE_POLIS_API_URL`: deployed Next.js origin, without a trailing path;
- `VITE_SUPABASE_URL`: Supabase project URL;
- `VITE_SUPABASE_ANON_KEY`: Supabase publishable/anon key, never the service role;
- `VITE_STOREKIT_PRODUCT_ID`: exact consumable product ID from App Store Connect.

The provisional bundle ID is `com.ateliersw.polis`. Override it while syncing
with `IOS_BUNDLE_ID=...` until App Store Connect establishes the final value.
The API deployment must set `MOBILE_APP_ORIGIN=capacitor://localhost` and use
the same StoreKit product and Apple bundle IDs.

## Develop

From the repository root:

```sh
npm install
npm run build:mobile
npm run mobile:sync
npm run mobile:open
```

The native project is `mobile/ios/App/App.xcodeproj`. Select the Atelier SW LLC
development team, confirm the bundle identifier, enable In-App Purchase, and
run on an iOS 15+ simulator or device.

## Security and purchase flow

Supabase access and refresh tokens use a local Capacitor plugin backed by iOS
Keychain with `AfterFirstUnlockThisDeviceOnly` accessibility. Browser development
uses `localStorage`, but native builds never fall back when the plugin is absent.

The StoreKit 2 bridge supplies the Supabase user UUID as `appAccountToken`, sends
Apple's signed transaction JWS and the Supabase access token to the server, and
calls `finish()` only after server fulfillment succeeds. Unfinished verified
transactions retry on app launch.

## Current tool gate

Capacitor sync and Swift syntax parsing work in this checkout. Full native
compilation currently requires installing/selecting the complete Xcode app;
Command Line Tools alone do not provide the iOS SDK or simulator.
