/**
 * INGRION Crypto Utilities
 */
import * as ed from "@noble/ed25519";

// Configure noble/ed25519 v2 with Web Crypto sha512
ed.etc.sha512Async = async (...msgs: Uint8Array[]) => {
  const all = ed.etc.concatBytes(...msgs);
  const hash = await crypto.subtle.digest("SHA-512", all);
  return new Uint8Array(hash);
};
ed.etc.sha512Sync = undefined as any; // force async path

export async function derivePublicKey(seedHex: string): Promise<string> {
  const seed = hexToBytes(seedHex.slice(0, 64));
  const pubKey = await ed.getPublicKeyAsync(seed);
  return bytesToHex(pubKey);
}

export async function signTransaction(
  txFields: Record<string, unknown>,
  seedHex: string
): Promise<Record<string, unknown>> {
  /**
   * CRITICAL: The signed payload must EXACTLY match what Go's json.Marshal produces
   * when it does: txCopy.Sig = ""; json.Marshal(txCopy)
   *
   * Go marshals struct fields in declaration order, omitting zero-value omitempty fields.
   * Go marshals map[string]string keys in ALPHABETICAL order.
   *
   * Transaction struct order:
   *   1.  type          (always)
   *   2.  from          (always)
   *   3.  to            (omitempty string)
   *   4.  amountPaise   (omitempty int64  — omitted when 0)
   *   5.  nonce         (always)
   *   6.  stock         (omitempty string)
   *   7.  bidPricePaise (omitempty int64)
   *   8.  bidShares     (omitempty int64)
   *   9.  category      (omitempty string)
   *   10. rhpHash       (omitempty string)
   *   11. meta          (omitempty map — keys sorted alphabetically by Go)
   *   12. timestamp     (always)
   *   13. sig           (always — set to "" for signing)
   *   14. shares        (omitempty int64)
   *   15. pricePaise    (omitempty int64)
   *   16. reason        (omitempty string)
   *   17. mandateType   (omitempty string)
   *   18. actionType    (omitempty string)
   *   19. ratio         (omitempty string)
   *   20. proposalId    (omitempty string)
   */

  // Helper: sort a meta object's keys alphabetically (mirroring Go's map marshal)
  const sortedMeta = (m: unknown): Record<string, string> | undefined => {
    if (!m || typeof m !== "object") return undefined;
    const obj = m as Record<string, string>;
    const sorted: Record<string, string> = {};
    Object.keys(obj).sort().forEach((k) => { sorted[k] = obj[k]; });
    return sorted;
  };

  // Build the object that will be signed, in exact Go struct field order
  const payload: Record<string, unknown> = {};

  // Fields 1–2: always present
  payload["type"] = txFields["type"];
  payload["from"] = txFields["from"];

  // Fields 3–4: omitempty strings/ints
  if (txFields["to"])           payload["to"]           = txFields["to"];
  const amtP = txFields["amountPaise"];
  if (amtP !== undefined && amtP !== null && amtP !== 0)
                                payload["amountPaise"]  = amtP;

  // Field 5: always present
  payload["nonce"] = txFields["nonce"];

  // Fields 6–10: omitempty
  if (txFields["stock"])        payload["stock"]         = txFields["stock"];
  const bpp = txFields["bidPricePaise"];
  if (bpp !== undefined && bpp !== null && bpp !== 0)
                                payload["bidPricePaise"] = bpp;
  const bs = txFields["bidShares"];
  if (bs !== undefined && bs !== null && bs !== 0)
                                payload["bidShares"]     = bs;
  if (txFields["category"])     payload["category"]      = txFields["category"];
  if (txFields["rhpHash"])      payload["rhpHash"]       = txFields["rhpHash"];

  // Field 11: meta — keys MUST be alphabetically sorted
  const meta = txFields["meta"];
  if (meta && typeof meta === "object" && Object.keys(meta as object).length > 0) {
    payload["meta"] = sortedMeta(meta);
  }

  // Field 12–13: timestamp then sig=""
  payload["timestamp"] = txFields["timestamp"];
  payload["sig"] = "";

  // Fields 14–20: omitempty (after sig in struct)
  const sh = txFields["shares"];
  if (sh !== undefined && sh !== null && sh !== 0)
                                payload["shares"]        = sh;
  const pp = txFields["pricePaise"];
  if (pp !== undefined && pp !== null && pp !== 0)
                                payload["pricePaise"]    = pp;
  if (txFields["reason"])       payload["reason"]        = txFields["reason"];
  if (txFields["mandateType"])  payload["mandateType"]   = txFields["mandateType"];
  if (txFields["actionType"])   payload["actionType"]    = txFields["actionType"];
  if (txFields["ratio"])        payload["ratio"]         = txFields["ratio"];
  if (txFields["proposalId"])   payload["proposalId"]    = txFields["proposalId"];

  // Sign the canonical JSON
  const raw = JSON.stringify(payload, null, 0);
  const bytes = new TextEncoder().encode(raw);
  const seed = hexToBytes(seedHex.slice(0, 64));
  const sig = await ed.signAsync(bytes, seed);
  const sigB64 = btoa(String.fromCharCode(...sig));

  // Return the full payload with real sig
  payload["sig"] = sigB64;
  return payload;
}

const PBKDF2_ITERATIONS = 600000;

export async function encryptKey(
  seedHex: string,
  password: string
): Promise<{ salt: string; iv: string; encrypted_key: string }> {
  const seed = hexToBytes(seedHex.slice(0, 64));
  const salt = crypto.getRandomValues(new Uint8Array(32));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const aesKey = await deriveAESKey(password, salt);
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, aesKey, seed);
  return {
    salt: bytesToBase64(salt),
    iv: bytesToBase64(iv),
    encrypted_key: bytesToBase64(new Uint8Array(ciphertext)),
  };
}

export async function decryptKey(
  encryptedKey: string,
  saltB64: string,
  ivB64: string,
  password: string,
  iterations: number = PBKDF2_ITERATIONS
): Promise<string> {
  const salt = base64ToBytes(saltB64);
  const iv = base64ToBytes(ivB64);
  const ciphertext = base64ToBytes(encryptedKey);
  const aesKey = await deriveAESKey(password, salt, iterations);
  try {
    const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, aesKey, ciphertext);
    return bytesToHex(new Uint8Array(plain));
  } catch {
    throw new Error("Invalid password or corrupted keystore");
  }
}

async function deriveAESKey(password: string, salt: Uint8Array, iterations = PBKDF2_ITERATIONS): Promise<CryptoKey> {
  const passwordKey = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveKey"]
  );
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations, hash: "SHA-256" },
    passwordKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

export async function hashFile(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  return bytesToHex(new Uint8Array(await crypto.subtle.digest("SHA-256", buffer)));
}

export async function hashJSON(obj: unknown): Promise<string> {
  const buffer = new TextEncoder().encode(JSON.stringify(obj));
  return bytesToHex(new Uint8Array(await crypto.subtle.digest("SHA-256", buffer)));
}

export function passwordStrength(password: string): "weak" | "fair" | "strong" | "very_strong" {
  let score = 0;
  if (password.length >= 12) score++;
  if (password.length >= 16) score++;
  if (/[A-Z]/.test(password)) score++;
  if (/[a-z]/.test(password)) score++;
  if (/[0-9]/.test(password)) score++;
  if (/[^A-Za-z0-9]/.test(password)) score++;
  if (score <= 2) return "weak";
  if (score <= 3) return "fair";
  if (score <= 4) return "strong";
  return "very_strong";
}

export function hexToBytes(hex: string): Uint8Array {
  const clean = hex.replace(/^0x/, "");
  const bytes = new Uint8Array(clean.length / 2);
  for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  return bytes;
}

export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function bytesToBase64(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes));
}

export function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

export function truncateAddress(address: string): string {
  if (!address || address.length < 14) return address;
  return `${address.slice(0, 8)}...${address.slice(-6)}`;
}

export function paiseToCurrency(paise: number): string {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", minimumFractionDigits: 2 }).format(paise / 100);
}

export function currencyToPaise(inr: number): number {
  return Math.round(inr * 100);
}

export function validateHexKey(hex: string): boolean {
  return /^[0-9a-fA-F]{64}$/.test(hex.trim());
}


// /**
//  * INGRION Crypto Utilities
//  */
// import * as ed from "@noble/ed25519";

// // Configure noble/ed25519 v2 with Web Crypto sha512
// ed.etc.sha512Async = async (...msgs: Uint8Array[]) => {
//   const all = ed.etc.concatBytes(...msgs);
//   const hash = await crypto.subtle.digest("SHA-512", all);
//   return new Uint8Array(hash);
// };
// ed.etc.sha512Sync = undefined as any; // force async path

// export async function derivePublicKey(seedHex: string): Promise<string> {
//   const seed = hexToBytes(seedHex.slice(0, 64));
//   const pubKey = await ed.getPublicKeyAsync(seed);
//   return bytesToHex(pubKey);
// }

// export async function signTransaction(
//   txFields: Record<string, unknown>,
//   seedHex: string
// ): Promise<Record<string, unknown>> {
//   const ordered: Record<string, unknown> = {};

//   const addIf = (key: string) => {
//     if (txFields[key] !== undefined && txFields[key] !== null && txFields[key] !== "") {
//       ordered[key] = txFields[key];
//     }
//   };

//   const addIfNum = (key: string) => {
//     if (txFields[key] !== undefined && txFields[key] !== 0) {
//       ordered[key] = txFields[key];
//     }
//   };

//   // ── Fields must match Go's Transaction struct declaration order exactly ──
//   // Go's json.Marshal emits fields in struct order, and verifyTransaction
//   // does: txCopy.Sig = ""; json.Marshal(txCopy) — so we must sign the same bytes.
//   //
//   // Go struct order:
//   //   type, from, to, amountPaise, nonce, stock, bidPricePaise, bidShares,
//   //   category, rhpHash, meta, timestamp, sig,
//   //   shares, pricePaise, reason, mandateType, actionType, ratio, proposalId

//   ordered["type"]  = txFields["type"];
//   ordered["from"]  = txFields["from"];
//   addIf("to");
//   addIfNum("amountPaise");
//   ordered["nonce"] = txFields["nonce"];
//   addIf("stock");
//   addIfNum("bidPricePaise");
//   addIfNum("bidShares");
//   addIf("category");
//   addIf("rhpHash");
//   addIf("meta");
//   ordered["timestamp"] = txFields["timestamp"];
//   // shares / pricePaise come BEFORE sig in the signed payload
//   // because Go's struct has them after sig but omitempty means they
//   // only appear when non-zero — include them before setting sig=""
//   addIfNum("shares");
//   addIfNum("pricePaise");
//   addIf("reason");
//   addIf("mandateType");
//   addIf("actionType");
//   addIf("ratio");
//   addIf("proposalId");
//   ordered["sig"] = "";

//   const raw = JSON.stringify(ordered, null, 0);
//   const bytes = new TextEncoder().encode(raw);
//   const seed = hexToBytes(seedHex.slice(0, 64));
//   const sig = await ed.signAsync(bytes, seed);
//   const sigB64 = btoa(String.fromCharCode(...sig));

//   ordered["sig"] = sigB64;

//   return ordered;
// }

// const PBKDF2_ITERATIONS = 600000;

// export async function encryptKey(
//   seedHex: string,
//   password: string
// ): Promise<{ salt: string; iv: string; encrypted_key: string }> {
//   const seed = hexToBytes(seedHex.slice(0, 64));
//   const salt = crypto.getRandomValues(new Uint8Array(32));
//   const iv = crypto.getRandomValues(new Uint8Array(12));
//   const aesKey = await deriveAESKey(password, salt);
//   const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, aesKey, seed);
//   return {
//     salt: bytesToBase64(salt),
//     iv: bytesToBase64(iv),
//     encrypted_key: bytesToBase64(new Uint8Array(ciphertext)),
//   };
// }

// export async function decryptKey(
//   encryptedKey: string,
//   saltB64: string,
//   ivB64: string,
//   password: string,
//   iterations: number = PBKDF2_ITERATIONS
// ): Promise<string> {
//   const salt = base64ToBytes(saltB64);
//   const iv = base64ToBytes(ivB64);
//   const ciphertext = base64ToBytes(encryptedKey);
//   const aesKey = await deriveAESKey(password, salt, iterations);
//   try {
//     const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, aesKey, ciphertext);
//     return bytesToHex(new Uint8Array(plain));
//   } catch {
//     throw new Error("Invalid password or corrupted keystore");
//   }
// }

// async function deriveAESKey(password: string, salt: Uint8Array, iterations = PBKDF2_ITERATIONS): Promise<CryptoKey> {
//   const passwordKey = await crypto.subtle.importKey(
//     "raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveKey"]
//   );
//   return crypto.subtle.deriveKey(
//     { name: "PBKDF2", salt, iterations, hash: "SHA-256" },
//     passwordKey,
//     { name: "AES-GCM", length: 256 },
//     false,
//     ["encrypt", "decrypt"]
//   );
// }

// export async function hashFile(file: File): Promise<string> {
//   const buffer = await file.arrayBuffer();
//   return bytesToHex(new Uint8Array(await crypto.subtle.digest("SHA-256", buffer)));
// }

// export async function hashJSON(obj: unknown): Promise<string> {
//   const buffer = new TextEncoder().encode(JSON.stringify(obj));
//   return bytesToHex(new Uint8Array(await crypto.subtle.digest("SHA-256", buffer)));
// }

// export function passwordStrength(password: string): "weak" | "fair" | "strong" | "very_strong" {
//   let score = 0;
//   if (password.length >= 12) score++;
//   if (password.length >= 16) score++;
//   if (/[A-Z]/.test(password)) score++;
//   if (/[a-z]/.test(password)) score++;
//   if (/[0-9]/.test(password)) score++;
//   if (/[^A-Za-z0-9]/.test(password)) score++;
//   if (score <= 2) return "weak";
//   if (score <= 3) return "fair";
//   if (score <= 4) return "strong";
//   return "very_strong";
// }

// export function hexToBytes(hex: string): Uint8Array {
//   const clean = hex.replace(/^0x/, "");
//   const bytes = new Uint8Array(clean.length / 2);
//   for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
//   return bytes;
// }

// export function bytesToHex(bytes: Uint8Array): string {
//   return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
// }

// export function bytesToBase64(bytes: Uint8Array): string {
//   return btoa(String.fromCharCode(...bytes));
// }

// export function base64ToBytes(b64: string): Uint8Array {
//   const bin = atob(b64);
//   const bytes = new Uint8Array(bin.length);
//   for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
//   return bytes;
// }

// export function truncateAddress(address: string): string {
//   if (!address || address.length < 14) return address;
//   return `${address.slice(0, 8)}...${address.slice(-6)}`;
// }

// export function paiseToCurrency(paise: number): string {
//   return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", minimumFractionDigits: 2 }).format(paise / 100);
// }

// export function currencyToPaise(inr: number): number {
//   return Math.round(inr * 100);
// }

// export function validateHexKey(hex: string): boolean {
//   return /^[0-9a-fA-F]{64}$/.test(hex.trim());
// }