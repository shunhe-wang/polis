// Independent review oracle (2026-10-21): retain selected unaffected CAs.
// https://nodejs.org/api/tls.html#tlssetdefaultcacertificatescerts On original Polis 8161dd6 / arbiter-examples da1b36b, a local
// OpenSSL-selected certificate succeeds without policy but fails with the policy
// when NODE_EXTRA_CA_CERTS is nonempty. No external network or DB is used.
// Run with Node >=22.19 or >=24.5 and a path to the policy being reviewed.
import assert from "node:assert/strict";
import { execFile, execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import tls from "node:tls";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";

assert.ok(process.argv[2], "Pass the policy .mjs path to review");
const policy = pathToFileURL(path.resolve(process.argv[2])).href;
const run = promisify(execFile);
const directory = fs.mkdtempSync(path.join(os.tmpdir(), "tls-spec-review-"));
const sockets = new Set();
let server;
try {
  execFileSync("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes",
    "-keyout", path.join(directory, "key.pem"), "-out", path.join(directory, "selected.pem"),
    "-subj", "/CN=SpecReviewOpenSSL", "-days", "1", "-sha256",
    "-addext", "subjectAltName=IP:127.0.0.1", "-addext", "basicConstraints=critical,CA:TRUE"],
  { stdio: "pipe", timeout: 10_000 });
  fs.writeFileSync(path.join(directory, "extra.pem"), tls.rootCertificates[0]);
  fs.mkdirSync(path.join(directory, "empty"));
  server = tls.createServer({
    key: fs.readFileSync(path.join(directory, "key.pem")),
    cert: fs.readFileSync(path.join(directory, "selected.pem")),
  }, socket => socket.end());
  server.on("connection", socket => {
    sockets.add(socket);
    socket.setTimeout(2_000, () => socket.destroy());
    socket.on("close", () => sockets.delete(socket));
  });
  server.on("tlsClientError", () => {});
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const env = {
    PATH: process.env.PATH,
    SSL_CERT_FILE: path.join(directory, "selected.pem"),
    SSL_CERT_DIR: path.join(directory, "empty"),
    NODE_EXTRA_CA_CERTS: path.join(directory, "extra.pem"),
  };
  const hash = execFileSync("openssl", ["x509", "-in", path.join(directory, "selected.pem"), "-hash", "-noout"], { encoding: "utf8", timeout: 10_000 }).trim();
  const hashedDirectory = path.join(directory, "hashed");
  fs.mkdirSync(hashedDirectory);
  fs.copyFileSync(path.join(directory, "selected.pem"), path.join(hashedDirectory, `${hash}.0`));
  const duplicatedBundle = path.join(directory, "duplicated.pem");
  fs.writeFileSync(duplicatedBundle, [...tls.rootCertificates, fs.readFileSync(path.join(directory, "selected.pem"), "utf8")].join("\n"));
  const scenarios = [
    { name: "baseline-openssl-with-extra", usePolicy: false, flag: "--use-openssl-ca", env },
    { name: "policy-openssl-file-with-extra", usePolicy: true, flag: "--use-openssl-ca", env },
    { name: "policy-openssl-directory-with-extra", usePolicy: true, flag: "--use-openssl-ca", env: { ...env, SSL_CERT_FILE: env.NODE_EXTRA_CA_CERTS, SSL_CERT_DIR: hashedDirectory } },
    // Default enumeration preserves duplicates. Do not mistake this for OpenSSL
    // mode or require file/directory paths in an enumerable bundled store.
    { name: "policy-bundled-duplicated-as-extra", usePolicy: true, flag: "--use-bundled-ca", env: { PATH: env.PATH, NODE_EXTRA_CA_CERTS: duplicatedBundle } },
  ];
  for (const { name, usePolicy, flag, env: childEnv } of scenarios) {
    const code = `
      import tls from "node:tls";
      ${usePolicy ? `await import(${JSON.stringify(policy)});` : ""}
      const socket = tls.connect({host:"127.0.0.1",port:${server.address().port},rejectUnauthorized:true}, () => {
        console.log("accepted"); socket.end();
      });
      socket.on("error", error => console.log(error.code));
      socket.setTimeout(1500, () => socket.destroy(new Error("fixture timeout")));
    `;
    const { stdout } = await run(process.execPath,
      [flag, "--input-type=module", "-e", code], { env: childEnv, encoding: "utf8", timeout: 3_000 });
    const outcome = stdout.trim();
    console.log(JSON.stringify({ node: process.version, scenario: name, outcome }));
    assert.equal(outcome, "accepted", usePolicy
      ? "The policy must retain the unaffected selected CA in every supported store mode"
      : "The unmitigated control must establish that Node trusts the explicitly selected local CA");
  }
} finally {
  for (const socket of sockets) socket.destroy();
  if (server?.listening) await new Promise(resolve => server.close(resolve));
  fs.rmSync(directory, { recursive: true, force: true });
}
