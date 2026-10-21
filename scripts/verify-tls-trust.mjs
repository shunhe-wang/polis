import "../src/security/node-trust.mjs";
import https from "node:https";

// The independent incident reporter publishes these twelve negative controls.
// A network failure is inconclusive and fails this opt-in check.
const affected = ["dv-g3b", "dv-g3c", "ov-g3b", "ov-g3c", "ev-g3b", "ev-g3c",
  "dv-g3b-aaa", "dv-g3c-aaa", "ov-g3b-aaa", "ov-g3c-aaa", "ev-g3b-aaa", "ev-g3c-aaa"]
  .map((prefix) => `${prefix}-emudhra.we-have-a-problem.com`);
const controls = ["github.com", "api.openai.com", "api.stripe.com"];
const certificateErrors = new Set([
  "CERT_REVOKED", "UNABLE_TO_GET_ISSUER_CERT_LOCALLY", "UNABLE_TO_VERIFY_LEAF_SIGNATURE",
  "SELF_SIGNED_CERT_IN_CHAIN", "DEPTH_ZERO_SELF_SIGNED_CERT",
]);

async function probe(host, client) {
  try {
    if (client === "fetch") {
      const response = await fetch(`https://${host}/`, { signal: AbortSignal.timeout(8000), redirect: "manual" });
      await response.body?.cancel();
    } else {
      await new Promise((resolve, reject) => {
        const request = https.get(`https://${host}/`, { agent: false, timeout: 8000 }, (response) => {
          response.resume();
          resolve();
        });
        request.on("timeout", () => request.destroy(new Error("TLS probe timed out")));
        request.on("error", reject);
      });
    }
    return "connected";
  } catch (error) {
    const code = error.cause?.code ?? error.code;
    if (certificateErrors.has(code)) return "certificate-rejected";
    return `inconclusive: ${code ?? error.message}`;
  }
}

(async () => {
  const rows = await Promise.all([...affected, ...controls].flatMap((host) => ["https", "fetch"].map(async (client) => {
    const result = await probe(host, client);
    const expected = affected.includes(host) ? "certificate-rejected" : "connected";
    return { host, client, result, pass: result === expected };
  })));
  console.log(JSON.stringify({ node: process.version, results: rows }, null, 2));
  if (rows.some((row) => !row.pass)) process.exitCode = 1;
})();
