/**
 * Symmetric encryption utilities for provider secret config fields.
 * Uses AES-256-GCM via the Web Crypto API (available in Node 20+ and edge runtime).
 * The APP_ENCRYPTION_KEY env var must be exactly 32 ASCII characters.
 */

function keyMaterial(): ArrayBuffer {
    const raw = process.env.APP_ENCRYPTION_KEY ?? "";
    const bytes = new TextEncoder().encode(raw);
    if (bytes.length !== 32)
        throw new Error("APP_ENCRYPTION_KEY must be exactly 32 bytes");
    // Copy into a plain ArrayBuffer so Web Crypto accepts it
    const buf = new ArrayBuffer(32);
    new Uint8Array(buf).set(bytes);
    return buf;
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
