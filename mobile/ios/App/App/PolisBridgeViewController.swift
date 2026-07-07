import Capacitor

final class PolisBridgeViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        bridge?.registerPluginInstance(PolisSecureStoragePlugin())
        bridge?.registerPluginInstance(PolisStoreKitPlugin())
    }
}
