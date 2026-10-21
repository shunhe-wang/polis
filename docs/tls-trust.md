# Node TLS trust

The October 2026 eMudhra incident affects Node's certificate trust independently of browser revocation updates.
Until an official Node release includes the intermediate-key blocklist, Polis removes the four root public keys listed in the [incident root inventory](https://emudhra.we-have-a-problem.com/roots.json) from the process's default CA set.
This uses Node's supported CA APIs and retains certificate and hostname verification.
It preserves the other default, system and extra CAs selected by Node, but removes an affected root even if supplied as an extra CA.

Root removal is deliberately broader than blocking the eight compromised intermediate keys.
Legitimate services chaining to these roots may fail until their certificate chains are replaced.
Do not restore connectivity by disabling verification or supplying an affected CA explicitly.
When using OpenSSL CA mode, set both `SSL_CERT_FILE` and `SSL_CERT_DIR` explicitly.
The policy loads only those selected sources plus Node's extra CAs; it fails closed when they cannot be enumerated.

Custom clients with their own `ca` option, other processes, and non-Node runtimes need separate verification.

Use Node 22.19+ or Node 24+.
The development/build/start commands preload the policy, and Next's Node instrumentation hook applies it before a new server instance handles requests, including Vercel Functions.
The hook is not imported into Edge bundles or browser code.
Existing deployments require a separately approved redeployment; changing this repository does not patch a running function.

Protect npm itself before downloading packages:

```sh
POLIS_TLS_PRELOAD="$(pwd)/src/security/node-trust.mjs"
NODE_OPTIONS="--import=\"$POLIS_TLS_PRELOAD\" ${NODE_OPTIONS-}" npm ci
```

CI sets that preload before `npm ci`.
For an opt-in live check using only unauthenticated test requests:

```sh
npm run test:tls-trust
```

Both HTTPS and fetch must reject all twelve published affected TLS chains with certificate errors while healthy controls connect.
DNS failures, timeouts and unavailable test hosts fail the check; they are not evidence of protection.
No live-network check runs during application startup or the ordinary unit suite.
Remove the temporary root distrust only after pinning an official patched Node release and verifying its real HTTPS/fetch paths, including the deployed functions.

Sources: [Node's merged fix](https://github.com/nodejs/node/pull/66871), [Node CA API](https://nodejs.org/api/tls.html#tlssetdefaultcacertificatescerts), [Next instrumentation](https://nextjs.org/docs/app/api-reference/file-conventions/instrumentation).
