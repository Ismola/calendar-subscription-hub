import assert from "node:assert/strict";
import test from "node:test";
import { env } from "./env";

test("uses a safe default timeout for Asismetro requests", () => {
    const previous = process.env.ASISMETRO_REQUEST_TIMEOUT_MS;
    delete process.env.ASISMETRO_REQUEST_TIMEOUT_MS;

    try {
        assert.equal(env.asismetroRequestTimeoutMs(), 90_000);
        process.env.ASISMETRO_REQUEST_TIMEOUT_MS = "120000";
        assert.equal(env.asismetroRequestTimeoutMs(), 120_000);
        process.env.ASISMETRO_REQUEST_TIMEOUT_MS = "invalid";
        assert.equal(env.asismetroRequestTimeoutMs(), 90_000);
    } finally {
        if (previous === undefined) {
            delete process.env.ASISMETRO_REQUEST_TIMEOUT_MS;
        } else {
            process.env.ASISMETRO_REQUEST_TIMEOUT_MS = previous;
        }
    }
});
