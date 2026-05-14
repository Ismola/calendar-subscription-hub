import { z } from "zod";

// ── Field definition ─────────────────────────────────────────────────────────

export type FieldType = "text" | "password" | "number" | "select" | "boolean";

export interface ProviderFieldDefinition {
    key: string;
    label: string;
    type: FieldType;
    required: boolean;
    secret: boolean; // encrypted at rest
    placeholder?: string;
    helpText?: string;
    options?: Array<{ value: string; label: string }>; // for select fields
    validation?: z.ZodTypeAny;
}

// ── Sync result ───────────────────────────────────────────────────────────────

export interface SyncResult {
    icsBody: string;
    checksum?: string;
}

// ── Provider contract ─────────────────────────────────────────────────────────

export interface ProviderDefinition {
    /** Stable machine-readable identifier, e.g. "google-calendar" */
    key: string;
    /** Human-readable name shown in the UI */
    name: string;
    /** Short description shown in the catalogue */
    description: string;
    /** Whether this provider is visible/selectable in the UI */
    enabled: boolean;
    /** Default refresh interval in minutes */
    defaultRefreshMinutes: number;
    /** Minimum API call interval in minutes for this provider */
    minSyncIntervalMinutes?: number;
    /** Declarative config fields rendered in the configuration form */
    fields: ProviderFieldDefinition[];
    /**
     * Validate provider-specific config. Receives the decrypted config object.
     * Should throw a ZodError or return a string error message on failure.
     */
    validateConfig(config: Record<string, unknown>): Promise<void> | void;
    /**
     * Execute a sync and return an ICS body.
     * Receives decrypted public config and decrypted secret config separately.
     */
    sync(
        config: Record<string, unknown>,
        secretConfig: Record<string, unknown>
    ): Promise<SyncResult>;
}
