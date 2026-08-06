import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isPublicPath } from "./public-path";

describe("isPublicPath", () => {
  it("exposes the exact Prometheus metrics route", () => {
    assert.equal(isPublicPath("/api/metrics"), true);
    assert.equal(isPublicPath("/api/metrics/private"), false);
    assert.equal(isPublicPath("/api/metrics-other"), false);
  });

  it("preserves the existing public routes", () => {
    assert.equal(isPublicPath("/login"), true);
    assert.equal(isPublicPath("/_next/static/app.js"), true);
    assert.equal(
      isPublicPath("/01234567-89ab-cdef-0123-456789abcdef"),
      true
    );
    assert.equal(isPublicPath("/api/subscriptions"), false);
  });
});
