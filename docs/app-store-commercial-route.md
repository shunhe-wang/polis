# App Store commercial route

**Decision:** Use StoreKit consumable purchases on iOS and keep Stripe purchases
on the web. Both paths grant the same non-expiring Election Pass credit.

## App Store Connect setup

1. Enroll the production app under Atelier SW LLC and create its bundle ID.
2. Create one consumable In-App Purchase for one Election Pass credit.
3. Use a stable product ID, then set that exact value as
   `APP_STORE_PRODUCT_ELECTION_PASS` in the API deployment.
4. Choose the closest Apple price point to USD $1.00. Always display StoreKit's
   localized product price in the native UI instead of hardcoding `$1`.
5. Complete the product's localization, review screenshot, tax, and
   agreements setup in App Store Connect.
6. Create a Sandbox Apple Account for purchase testing.

## Server configuration

Set these variables in the Vercel environment that hosts the API:

- `APPLE_BUNDLE_ID`: the exact iOS bundle identifier.
- `APPLE_APP_ID`: the numeric App Store app ID. It is required for production
  verification and can remain empty in sandbox-only environments.
- `APPLE_IAP_ENVIRONMENT`: `Sandbox` for development/TestFlight verification or
  `Production` for the public App Store deployment.
- `APP_STORE_PRODUCT_ELECTION_PASS`: the consumable product ID.
- `APPLE_ROOT_CA_CERTS_BASE64`: comma-separated, base64-encoded DER copies of
  Apple's current root certificates from the Apple PKI page.

For each downloaded `.cer` file, `base64 < certificate.cer | tr -d '\n'`
produces one value. Join the values with commas and paste the result into
`APPLE_ROOT_CA_CERTS_BASE64`; these root certificates are public, not private
signing keys.

Keep sandbox and production deployments separate. A production credit system
must not accept sandbox transactions.

## Native purchase contract

The iOS client must:

1. Require a signed-in, verified Polis account before beginning a purchase.
2. Convert the Supabase user ID to a UUID and supply it through StoreKit's
   `appAccountToken` purchase option.
3. Send the resulting signed transaction JWS to
   `POST /api/storekit/transactions` as `signedTransaction`.
4. Refresh the account credit balance after the API returns success.
5. Call StoreKit `finish()` only after the server confirms that the credit was
   delivered or that the transaction was already fulfilled.
6. Process StoreKit's unfinished transaction sequence on every app launch so a
   purchase interrupted by connectivity is retried safely.

The server verifies Apple's certificate chain, bundle ID, environment,
transaction type, product ID, revocation state, and `appAccountToken`. The
database uses Apple's transaction ID as the idempotency key and grants the
credit in the same transaction that records fulfillment.

## Required validation before release

- successful sandbox purchase grants exactly one credit;
- replaying the same signed transaction grants zero additional credits;
- a transaction bound to another account is rejected;
- network loss after Apple payment retries through unfinished transactions;
- canceled, pending, revoked, malformed, and wrong-product transactions do not
  grant credits;
- TestFlight purchase and App Review demo-account flows succeed;
- refund and App Store Server Notification handling is implemented and tested
  before production sales.
