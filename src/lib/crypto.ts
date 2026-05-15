/**
 * Symmetric encryption utilities for provider secret config fields.
 * Uses AES-256-GCM via the Web Crypto API (available in Node 20+ and edge runtime).
 * APP_ENCRYPTION_KEY supports either:
 * - a raw 32-byte string, or
 * - a Base64-encoded value that decodes to exactly 32 bytes.
 *
 * Optional decryption compatibility:
 * - LEGACY_APP_ENCRYPTION_KEYS: comma-separated list of previous keys.
 */

import { env } from "@/lib/env";

function copyAsArrayBuffer(bytes: Uint8Array): ArrayBuffer {
    const buf = new ArrayBuffer(32);
    new Uint8Array(buf).set(bytes);
    return buf;
}

function parseKeyMaterial(raw: string): ArrayBuffer {
    const normalizedRaw = raw.trim();

    // 1) Raw 32-byte key
    const rawBytes = new TextEncoder().encode(normalizedRaw);
    if (rawBytes.length === 32) {
        return copyAsArrayBuffer(rawBytes);
    }

    // 2) Base64 key that decodes to 32 bytes
    const decoded = Buffer.from(normalizedRaw, "base64");
    const normalizedInput = normalizedRaw.replace(/=+$/, "");
    const normalizedDecoded = decoded.toString("base64").replace(/=+$/, "");

    if (decoded.length === 32 && normalizedDecoded === normalizedInput) {
        return copyAsArrayBuffer(decoded);
    }

    throw new Error(
        "APP_ENCRYPTION_KEY must be 32 raw bytes or Base64 for 32 bytes"
    );
}

function candidateDecryptionKeys(): string[] {
    const current = env.encryptionKey();
    const fromEnv = (process.env.LEGACY_APP_ENCRYPTION_KEYS ?? "")
        .split(",")
        .map((key) => key.trim())
        .filter((key) => key.length > 0);

    // Previous development fallback key used in this repository.
    const defaults = ["0123456789abcdef0123456789abcdef"];

    return [current, ...fromEnv, ...defaults].filter(
        (key, index, arr) => arr.indexOf(key) === index
    );
}

async function importKey(rawKey: string): Promise<CryptoKey> {
    return crypto.subtle.importKey("raw", parseKeyMaterial(rawKey), "AES-GCM", false, [
        "encrypt",
        "decrypt",
    ]);
}

export async function encrypt(plaintext: string): Promise<string> {
    const key = await importKey(env.encryptionKey());
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
    const combined = Buffer.from(encoded, "base64");
    const iv = combined.subarray(0, 12);
    const ciphertext = combined.subarray(12);

    for (const keyRaw of candidateDecryptionKeys()) {
        try {
            const key = await importKey(keyRaw);
            const plaintext = await crypto.subtle.decrypt(
                { name: "AES-GCM", iv },
                key,
                ciphertext
            );
            return new TextDecoder().decode(plaintext);
        } catch {
            // Try next key candidate.
        }
    }

    throw new Error(
        "Unable to decrypt secret config with current or legacy APP_ENCRYPTION_KEY"
    );
}
