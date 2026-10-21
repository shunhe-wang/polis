import { createHash, X509Certificate } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { delimiter, join } from "node:path";
import tls from "node:tls";

// Temporary root distrust while the October 2026 intermediate-key blocklist
// awaits a Node release. These are root SPKI SHA-256 hashes, not host pins.
// Source: https://emudhra.we-have-a-problem.com/roots.json (2026-10-21).
const distrustedRoots = new Set([
  "c619e4780ed8e0abeda24ad732567de4383a7ea941338f6d1a7d1b49ac792fe9",
  "0a6c2b2ca5b364207954171987ac9d2178561569d8205457e77ca90c32ede282",
  "bd153ed7b0434f6886b17bce8bbe84ed340c7132d702a8f4fa318f756ecbd6f3",
  "8d417db2dd8bf5e3084d1e3f196d583849d81bdd4c00c70b9d39369e96b8c782",
]);

if (process.env.NODE_TLS_REJECT_UNAUTHORIZED === "0") {
  throw new Error("TLS certificate verification must remain enabled.");
}
if (typeof tls.getCACertificates !== "function" || typeof tls.setDefaultCACertificates !== "function") {
  throw new Error("The TLS trust policy requires Node 22.19 or newer.");
}

let selectedCertificates = tls.getCACertificates("default");
if (selectedCertificates.length === 0) {
  // Node does not enumerate OpenSSL's lazy-loaded CA file/directory through
  // getCACertificates(). Only reconstruct it when BOTH paths are explicit;
  // falling back to bundled roots could restore a CA the operator distrusted.
  if (!process.env.SSL_CERT_FILE || !process.env.SSL_CERT_DIR) {
    throw new Error("TLS CA enumeration requires explicit SSL_CERT_FILE and SSL_CERT_DIR for OpenSSL CA mode.");
  }
  const readCertificates = (path) => {
    const pem = readFileSync(path, "utf8");
    const certificates = pem.match(/-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/g);
    if (!certificates?.length) throw new Error("A selected TLS CA file contains no certificates.");
    return certificates;
  };
  selectedCertificates = readCertificates(process.env.SSL_CERT_FILE);
  for (const directory of process.env.SSL_CERT_DIR.split(delimiter)) {
    if (!directory) throw new Error("TLS CA directories must be explicit paths.");
    for (const name of readdirSync(directory)) {
      if (/^[0-9a-f]{8}\.\d+$/i.test(name)) {
        selectedCertificates.push(...readCertificates(join(directory, name)));
      }
    }
  }
  selectedCertificates.push(...tls.getCACertificates("extra"));
}

const certificates = selectedCertificates.filter((pem) => {
  const key = new X509Certificate(pem).publicKey.export({ type: "spki", format: "der" });
  return !distrustedRoots.has(createHash("sha256").update(key).digest("hex"));
});
if (certificates.length === 0) {
  throw new Error("No trusted CA certificates remain after applying the TLS policy.");
}
tls.setDefaultCACertificates(certificates);
