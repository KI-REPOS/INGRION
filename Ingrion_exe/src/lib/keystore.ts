/**
 * INGRION Keystore Manager
 * Reads/writes {AppData}/INGRION/keystore.json via Tauri FS plugin
 */
import type { Keystore, AppConfig } from "@/types";

// Dynamically import Tauri FS to avoid crashes if plugin not ready
async function getTauriFs() {
  const mod = await import("@tauri-apps/plugin-fs");
  return mod;
}

const KEYSTORE_PATH = "INGRION/keystore.json";
const CONFIG_PATH = "INGRION/node_config.json";
const APP_DIR = "INGRION";

async function getBaseDir() {
  const { BaseDirectory } = await getTauriFs();
  return BaseDirectory.AppData;
}

async function ensureDir() {
  try {
    const { exists, mkdir, BaseDirectory } = await getTauriFs();
    const dirExists = await exists(APP_DIR, { baseDir: BaseDirectory.AppData }).catch(() => false);
    if (!dirExists) {
      await mkdir(APP_DIR, { baseDir: BaseDirectory.AppData, recursive: true });
    }
  } catch (e) {
    console.warn("[keystore] ensureDir failed:", e);
  }
}

export async function keystoreExists(): Promise<boolean> {
  try {
    const { exists, BaseDirectory } = await getTauriFs();
    return await exists(KEYSTORE_PATH, { baseDir: BaseDirectory.AppData });
  } catch (e) {
    console.warn("[keystore] exists check failed:", e);
    return false;
  }
}

export async function readKeystore(): Promise<Keystore | null> {
  try {
    const { readTextFile, BaseDirectory } = await getTauriFs();
    const content = await readTextFile(KEYSTORE_PATH, { baseDir: BaseDirectory.AppData });
    return JSON.parse(content) as Keystore;
  } catch (e) {
    console.warn("[keystore] readKeystore failed:", e);
    return null;
  }
}

export async function writeKeystore(keystore: Keystore): Promise<void> {
  await ensureDir();
  const { writeTextFile, BaseDirectory } = await getTauriFs();
  await writeTextFile(KEYSTORE_PATH, JSON.stringify(keystore, null, 2), {
    baseDir: BaseDirectory.AppData,
  });
}

export async function readNodeConfig(): Promise<Partial<AppConfig["node"]>> {
  try {
    const { readTextFile, BaseDirectory } = await getTauriFs();
    const content = await readTextFile(CONFIG_PATH, { baseDir: BaseDirectory.AppData });
    return JSON.parse(content);
  } catch {
    return { url: "http://127.0.0.1:4001", apiKey: "" };
  }
}

export async function writeNodeConfig(config: AppConfig["node"]): Promise<void> {
  await ensureDir();
  const { writeTextFile, BaseDirectory } = await getTauriFs();
  await writeTextFile(CONFIG_PATH, JSON.stringify(config, null, 2), {
    baseDir: BaseDirectory.AppData,
  });
}

export function defaultConfig(): AppConfig {
  return {
    node: { url: "http://127.0.0.1:4001", apiKey: "" },
    theme: "dark",
    refreshInterval: 10,
    largeTransferThreshold: 10000,
    notifyBlocks: true,
    notifyTransfers: true,
    notifyIPO: true,
  };
}
