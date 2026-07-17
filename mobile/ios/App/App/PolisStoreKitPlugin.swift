import Capacitor
import Foundation
import StoreKit

@available(iOS 15.0, *)
@objc(PolisStoreKitPlugin)
public final class PolisStoreKitPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "PolisStoreKitPlugin"
    public let jsName = "PolisStoreKit"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "getProduct", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "purchase", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getUnfinishedTransactions", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "finish", returnType: CAPPluginReturnPromise)
    ]

    private var updatesTask: Task<Void, Never>?

    // StoreKit 2 requires a Transaction.updates listener from launch: Ask to
    // Buy approvals, offer-code redemptions, and purchases completed outside
    // the in-app flow arrive only through this stream. The web layer fulfills
    // the transaction with the server and then finishes it.
    override public func load() {
        updatesTask = Task { [weak self] in
            for await verification in Transaction.updates {
                guard let self else { return }
                if case .verified(let transaction) = verification {
                    self.notifyListeners("transactionUpdated", data: [
                        "transactionId": String(transaction.id),
                        "signedTransaction": verification.jwsRepresentation
                    ])
                }
            }
        }
    }

    deinit {
        updatesTask?.cancel()
    }

    @objc func getProduct(_ call: CAPPluginCall) {
        guard let productID = requiredString("productId", from: call) else { return }
        Task { @MainActor in
            do {
                guard let product = try await Product.products(for: [productID]).first else {
                    call.reject("The Election Pass is not available in this storefront")
                    return
                }
                call.resolve([
                    "id": product.id,
                    "displayName": product.displayName,
                    "description": product.description,
                    "displayPrice": product.displayPrice
                ])
            } catch {
                call.reject("Could not load the Election Pass", nil, error)
            }
        }
    }

    @objc func purchase(_ call: CAPPluginCall) {
        guard let productID = requiredString("productId", from: call) else { return }
        guard let accountTokenValue = requiredString("appAccountToken", from: call) else { return }
        guard let accountToken = UUID(uuidString: accountTokenValue) else {
            call.reject("The Polis account ID must be a UUID")
            return
        }

        Task { @MainActor in
            do {
                guard let product = try await Product.products(for: [productID]).first else {
                    call.reject("The Election Pass is not available in this storefront")
                    return
                }
                let result = try await product.purchase(options: [.appAccountToken(accountToken)])
                switch result {
                case .success(let verification):
                    resolve(verification: verification, call: call)
                case .pending:
                    call.resolve(["status": "pending"])
                case .userCancelled:
                    call.resolve(["status": "cancelled"])
                @unknown default:
                    call.reject("StoreKit returned an unknown purchase state")
                }
            } catch {
                call.reject("The Election Pass purchase failed", nil, error)
            }
        }
    }

    @objc func getUnfinishedTransactions(_ call: CAPPluginCall) {
        Task {
            var transactions: [[String: String]] = []
            for await verification in Transaction.unfinished {
                if case .verified(let transaction) = verification {
                    transactions.append([
                        "transactionId": String(transaction.id),
                        "signedTransaction": verification.jwsRepresentation
                    ])
                }
            }
            call.resolve(["transactions": transactions])
        }
    }

    @objc func finish(_ call: CAPPluginCall) {
        guard let transactionIDValue = requiredString("transactionId", from: call),
              let transactionID = UInt64(transactionIDValue) else {
            if call.getString("transactionId") != nil {
                call.reject("A numeric StoreKit transaction ID is required")
            }
            return
        }

        Task {
            for await verification in Transaction.unfinished {
                if case .verified(let transaction) = verification,
                   transaction.id == transactionID {
                    await transaction.finish()
                    call.resolve()
                    return
                }
            }
            // Already-finished is an idempotent success.
            call.resolve()
        }
    }

    private func resolve(
        verification: VerificationResult<Transaction>,
        call: CAPPluginCall
    ) {
        switch verification {
        case .verified(let transaction):
            call.resolve([
                "status": "purchased",
                "transactionId": String(transaction.id),
                "signedTransaction": verification.jwsRepresentation
            ])
        case .unverified(_, let error):
            call.reject("StoreKit could not verify this purchase", nil, error)
        }
    }

    private func requiredString(_ key: String, from call: CAPPluginCall) -> String? {
        guard let value = call.getString(key)?.trimmingCharacters(in: .whitespacesAndNewlines),
              !value.isEmpty else {
            call.reject("\(key) is required")
            return nil
        }
        return value
    }
}
