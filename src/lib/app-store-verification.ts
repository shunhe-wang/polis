import "server-only";

import {
  Environment,
  SignedDataVerifier,
  type JWSTransactionDecodedPayload,
  type ResponseBodyV2DecodedPayload,
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

function createVerifier(environment: Environment): SignedDataVerifier {
  const bundleId = process.env.APPLE_BUNDLE_ID?.trim();
  const rootCertificates = (process.env.APPLE_ROOT_CA_CERTS_BASE64 ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)
    .map((value) => Buffer.from(value, "base64"));

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
  const configuredEnvironment = getEnvironment(
    process.env.APPLE_IAP_ENVIRONMENT
  );

  try {
    return await createVerifier(configuredEnvironment).verifyAndDecodeTransaction(
      signedTransaction
    );
  } catch (error) {
    // App Review and TestFlight purchases are made in the Sandbox environment
    // against the production backend, so a production server must fall back to
    // sandbox verification. A forged payload fails signature verification in
    // both environments; only the environment claim differs for honest
    // sandbox transactions.
    if (configuredEnvironment === Environment.PRODUCTION) {
      try {
        return await createVerifier(
          Environment.SANDBOX
        ).verifyAndDecodeTransaction(signedTransaction);
      } catch {
        throw error;
      }
    }
    throw error;
  }
}

export async function verifyAppStoreNotification(
  signedPayload: string
): Promise<ResponseBodyV2DecodedPayload> {
  const configuredEnvironment = getEnvironment(
    process.env.APPLE_IAP_ENVIRONMENT
  );

  try {
    return await createVerifier(
      configuredEnvironment
    ).verifyAndDecodeNotification(signedPayload);
  } catch (error) {
    // Sandbox notifications (App Review, TestFlight) can reach the production
    // notification URL; mirror the transaction-verification fallback.
    if (configuredEnvironment === Environment.PRODUCTION) {
      try {
        return await createVerifier(
          Environment.SANDBOX
        ).verifyAndDecodeNotification(signedPayload);
      } catch {
        throw error;
      }
    }
    throw error;
  }
}
