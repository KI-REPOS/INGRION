/**
 * INGRION Cryptographic Utilities
 *
 * All cryptographic operations are performed client-side.
 * Private keys NEVER leave the browser.
 */
import nacl from 'tweetnacl'
import { encodeBase64, decodeBase64 } from 'tweetnacl-util'

/**
 * Generate a new Ed25519 keypair.
 * @returns {{ publicKey: Uint8Array, secretKey: Uint8Array, publicKeyB64: string }}
 */
export function generateKeypair() {
  const keypair = nacl.sign.keyPair()
  return {
    publicKey: keypair.publicKey,
    secretKey: keypair.secretKey,
    publicKeyB64: encodeBase64(keypair.publicKey),
  }
}

/**
 * Hash a password client-side using SHA-256.
 * The public key bytes are used as a deterministic salt to prevent
 * rainbow table attacks without requiring server-side salt storage.
 *
 * @param {string} password
 * @param {Uint8Array} publicKey
 * @returns {Promise<string>} hex-encoded hash
 */
export async function hashPassword(password, publicKey) {
  const encoder = new TextEncoder()
  const passwordBytes = encoder.encode(password)
  const saltedInput = new Uint8Array(passwordBytes.length + publicKey.length)
  saltedInput.set(publicKey)
  saltedInput.set(passwordBytes, publicKey.length)

  const hashBuffer = await crypto.subtle.digest('SHA-256', saltedInput)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
}

/**
 * Extract a facial embedding from a captured image File.
 *
 * Uses the same pixel-sampling algorithm as the Government Archive:
 * - Draws image onto a 128x128 canvas
 * - Samples a 16x16 grid → 128 float32 values (luma + chrominance)
 * - L2 normalises the vector
 * - Returns base64-encoded float32 array
 *
 * This ensures INGRION and gov-archive produce compatible embeddings
 * from photos of the same face, enabling cosine similarity > 75%.
 *
 * @param {File} imageFile — JPEG captured from live camera
 * @returns {Promise<string>} base64-encoded 128-float32 embedding
 */
export async function extractFacialEmbedding(imageFile) {
  const EMBED_DIM = 128
  const GRID = 16 // 16x16 = 256 samples → 128 floats

  // Load the File into an HTMLImageElement
  const bitmap = await createImageBitmap(imageFile)

  const canvas = document.createElement('canvas')
  canvas.width = 128
  canvas.height = 128
  const ctx = canvas.getContext('2d')

  // Draw face image scaled to 128x128 (same as gov-archive)
  ctx.drawImage(bitmap, 0, 0, 128, 128)
  bitmap.close()

  const imageData = ctx.getImageData(0, 0, 128, 128)
  const pixels = imageData.data // RGBA flat array

  const embedding = new Float32Array(EMBED_DIM)

  // Identical sampling logic to gov-archive/frontend/src/lib/embedding.js
  let idx = 0
  for (let gy = 0; gy < GRID && idx < EMBED_DIM; gy++) {
    for (let gx = 0; gx < GRID && idx < EMBED_DIM; gx += 2) {
      const px = gx * 8
      const py = gy * 8
      const offset = (py * 128 + px) * 4

      const r = pixels[offset] / 255
      const g = pixels[offset + 1] / 255
      const b = pixels[offset + 2] / 255

      // Luminance + chrominance (matches gov-archive exactly)
      const luma = 0.299 * r + 0.587 * g + 0.114 * b
      embedding[idx++] = luma
      if (idx < EMBED_DIM) {
        embedding[idx++] = (r - luma) * 2 // Cr-like
      }
    }
  }

  // L2 normalise (matches gov-archive exactly)
  let norm = 0
  for (let i = 0; i < EMBED_DIM; i++) norm += embedding[i] * embedding[i]
  norm = Math.sqrt(norm) || 1
  for (let i = 0; i < EMBED_DIM; i++) embedding[i] /= norm

  const bytes = new Uint8Array(embedding.buffer)
  return encodeBase64(bytes)
}

/**
 * Sign a message with the Ed25519 private key.
 * Used to prove key ownership without transmitting the private key.
 *
 * @param {Uint8Array} message
 * @param {Uint8Array} secretKey
 * @returns {string} base64-encoded signature
 */
export function signMessage(message, secretKey) {
  const signature = nacl.sign.detached(message, secretKey)
  return encodeBase64(signature)
}

/**
 * Verify an Ed25519 signature.
 *
 * @param {Uint8Array} message
 * @param {string} signatureB64
 * @param {string} publicKeyB64
 * @returns {boolean}
 */
export function verifySignature(message, signatureB64, publicKeyB64) {
  try {
    const signature = decodeBase64(signatureB64)
    const publicKey = decodeBase64(publicKeyB64)
    return nacl.sign.detached.verify(message, signature, publicKey)
  } catch {
    return false
  }
}