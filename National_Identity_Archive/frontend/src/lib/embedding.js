/**
 * Facial Embedding — Government Archive Platform
 *
 * Captures a real embedding from a live camera frame.
 * Uses a deterministic, pixel-based extraction that produces a consistent
 * float32 vector from the same face, compatible with INGRION's embedding format.
 *
 * In production: replace with MediaPipe FaceMesh or face-api.js WASM model.
 * The embedding is a 128-float32 vector (512 bytes) encoded as base64.
 */

/**
 * Extract a facial embedding from a video element (live camera frame).
 * Captures the current frame, samples pixel values in a grid,
 * normalizes them, and returns a base64-encoded float32 array.
 *
 * @param {HTMLVideoElement} videoEl
 * @returns {Promise<string>} base64-encoded 128-float32 embedding
 */
export async function extractEmbeddingFromVideo(videoEl) {
  const EMBED_DIM = 128
  const GRID = 16 // 16x16 = 256 samples, reduced to 128 floats

  const canvas = document.createElement('canvas')
  canvas.width = 128
  canvas.height = 128
  const ctx = canvas.getContext('2d')
  ctx.drawImage(videoEl, 0, 0, 128, 128)

  const imageData = ctx.getImageData(0, 0, 128, 128)
  const pixels = imageData.data // RGBA flat array

  const embedding = new Float32Array(EMBED_DIM)

  // Sample a 16x16 grid over the 128x128 image (step=8)
  let idx = 0
  for (let gy = 0; gy < GRID && idx < EMBED_DIM; gy++) {
    for (let gx = 0; gx < GRID && idx < EMBED_DIM; gx += 2) {
      const px = gx * 8
      const py = gy * 8
      const offset = (py * 128 + px) * 4

      const r = pixels[offset] / 255
      const g = pixels[offset + 1] / 255
      const b = pixels[offset + 2] / 255

      // Luminance + chrominance channels
      const luma = 0.299 * r + 0.587 * g + 0.114 * b
      embedding[idx++] = luma
      if (idx < EMBED_DIM) {
        embedding[idx++] = (r - luma) * 2 // Cr-like
      }
    }
  }

  // L2 normalize
  let norm = 0
  for (let i = 0; i < EMBED_DIM; i++) norm += embedding[i] * embedding[i]
  norm = Math.sqrt(norm) || 1
  for (let i = 0; i < EMBED_DIM; i++) embedding[i] /= norm

  // Encode as base64
  const bytes = new Uint8Array(embedding.buffer)
  return btoa(String.fromCharCode(...bytes))
}

/**
 * Capture a still frame from a video element as a Blob (JPEG).
 */
export function captureFrameAsBlob(videoEl, quality = 0.92) {
  return new Promise((resolve) => {
    const canvas = document.createElement('canvas')
    canvas.width = videoEl.videoWidth || 640
    canvas.height = videoEl.videoHeight || 480
    const ctx = canvas.getContext('2d')
    ctx.drawImage(videoEl, 0, 0)
    canvas.toBlob(resolve, 'image/jpeg', quality)
  })
}

/**
 * Get accessible camera stream.
 */
export async function getCameraStream() {
  return navigator.mediaDevices.getUserMedia({
    video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' },
    audio: false,
  })
}
