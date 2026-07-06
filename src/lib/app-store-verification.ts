import "server-only";

import {
  Environment,
  SignedDataVerifier,
  type JWSTransactionDecodedPayload,
} from "@apple/app-store-server-library";

function getEnvironment(value: string | undefined): Environment {
  if (value === Environment.SANDBOX) return Environment.SANDBOX;
  if (value === Environment.PRODUCTION) return Environment.PRODUCTION;
  throw configurationError(
    "APPLE_IAP_ENVIRONMENT must be Sandbox or Production"
  );
}

function configurationError(message: string): Error {
  const error = new Error(message);
  error.name = "AppStoreConfigurationError";
  return error;
}

function createVerifier(): SignedDataVerifier {
  const bundleId = process.env.APPLE_BUNDLE_ID?.trim();
  const rootCertificates = (process.env.APPLE_ROOT_CA_CERTS_BASE64 ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)
    .map((value) => Buffer.from(value, "base64"));
  const environment = getEnvironment(process.env.APPLE_IAP_ENVIRONMENT);

  if (!bundleId || rootCertificates.length === 0) {
    throw configurationError(
      "Apple bundle ID and root certificates are not configured"
    );
  }

  const appAppleIdValue = process.env.APPLE_APP_ID?.trim();
  const appAppleId =
    appAppleIdValue && /^\d+$/.test(appAppleIdValue)
      ? Number.parseInt(appAppleIdValue, 10)
      : undefined;
  if (
    environment === Environment.PRODUCTION &&
    (!Number.isSafeInteger(appAppleId) || Number(appAppleId) <= 0)
  ) {
    throw configurationError(
      "APPLE_APP_ID is required for production transaction verification"
    );
  }

  try {
    return new SignedDataVerifier(
      rootCertificates,
      true,
      environment,
      bundleId,
      appAppleId
    );
  } catch {
    throw configurationError("Apple root certificate configuration is invalid");
  }
}

export async function verifyAppStoreTransaction(
  signedTransaction: string
): Promise<JWSTransactionDecodedPayload> {
  return createVerifier().verifyAndDecodeTransaction(signedTransaction);
}
