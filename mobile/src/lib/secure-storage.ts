import { Capacitor, registerPlugin } from "@capacitor/core";

interface SecureStoragePlugin {
  get(options: { key: string }): Promise<{ value: string | null }>;
  set(options: { key: string; value: string }): Promise<void>;
  remove(options: { key: string }): Promise<void>;
}

const NativeSecureStorage = registerPlugin<SecureStoragePlugin>("PolisSecureStorage");

function browserStorage(): Storage {
  if (typeof window === "undefined") {
    throw new Error("Browser storage is unavailable");
  }
  return window.localStorage;
}

export const secureAuthStorage = {
  async getItem(key: string): Promise<string | null> {
    if (Capacitor.isNativePlatform()) {
      return (await NativeSecureStorage.get({ key })).value;
    }
    return browserStorage().getItem(key);
  },

  async setItem(key: string, value: string): Promise<void> {
    if (Capacitor.isNativePlatform()) {
      await NativeSecureStorage.set({ key, value });
      return;
    }
    browserStorage().setItem(key, value);
  },

  async removeItem(key: string): Promise<void> {
    if (Capacitor.isNativePlatform()) {
      await NativeSecureStorage.remove({ key });
      return;
    }
    browserStorage().removeItem(key);
  },
};
