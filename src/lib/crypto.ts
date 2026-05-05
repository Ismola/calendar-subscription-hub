/**
 * Symmetric encryption utilities for provider secret config fields.
 * Uses AES-256-GCM via the Web Crypto API (available in Node 20+ and edge runtime).
 * APP_ENCRYPTION_KEY supports either:
 * - a raw 32-byte string, or
 * - a Base64-encoded value that decodes to exactly 32 bytes.
 */

function copyAsArrayBuffer(bytes: Uint8Array): ArrayBuffer {
    const buf = new ArrayBuffer(32);
    new Uint8Array(buf).set(bytes);
    return buf;
}

function keyMaterial(): ArrayBuffer {
    const raw = (process.env.APP_ENCRYPTION_KEY ?? "").trim();

    // 1) Raw 32-byte key
    const rawBytes = new TextEncoder().encode(raw);
    if (rawBytes.length === 32) {
        return copyAsArrayBuffer(rawBytes);
    }

    // 2) Base64 key that decodes to 32 bytes
    const decoded = Buffer.from(raw, "base64");
    const normalizedInput = raw.replace(/=+$/, "");
    const normalizedDecoded = decoded.toString("base64").replace(/=+$/, "");

    if (decoded.length === 32 && normalizedDecoded === normalizedInput) {
        return copyAsArrayBuffer(decoded);
    }

    throw new Error(
        "APP_ENCRYPTION_KEY must be 32 raw bytes or Base64 for 32 bytes"
    );
}

async function importKey(): Promise<CryptoKey> {
    return crypto.subtle.importKey("raw", keyMaterial(), "AES-GCM", false, [
        "encrypt",
        "decrypt",
    ]);
}

export async function encrypt(plaintext: string): Promise<string> {
    const key = await importKey();
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encoded = new TextEncoder().encode(plaintext);
    const ciphertext = await crypto.subtle.encrypt(
        { name: "AES-GCM", iv },
        key,
        encoded
    );
    const combined = new Uint8Array(iv.byteLength + ciphertext.byteLength);
    combined.set(iv, 0);
    combined.set(new Uint8Array(ciphertext), iv.byteLength);
    return Buffer.from(combined).toString("base64");
}

export async function decrypt(encoded: string): Promise<string> {
    const key = await importKey();
    const combined = Buffer.from(encoded, "base64");
    const iv = combined.subarray(0, 12);
    const ciphertext = combined.subarray(12);
    const plaintext = await crypto.subtle.decrypt(
        { name: "AES-GCM", iv },
        key,
        ciphertext
    );
    return new TextDecoder().decode(plaintext);
}
