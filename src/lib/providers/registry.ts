import { asismetroAutomationsProvider } from "./asismetro-automations";
import type { ProviderDefinition } from "./types";

/**
 * Central registry of available providers.
 *
 * To add a new provider, import its definition and push it here:
 *
 *   import { myProvider } from "./my-provider";
 *   registry.push(myProvider);
 */
const registry: ProviderDefinition[] = [
    asismetroAutomationsProvider,
];

export function getProviders(): ProviderDefinition[] {
    return registry.filter((p) => p.enabled);
}

export function getAllProviders(): ProviderDefinition[] {
    return registry;
}

export function getProvider(key: string): ProviderDefinition | undefined {
    return registry.find((p) => p.key === key);
}
