import type { ExternalModuleNamespace, WebDeckModule } from "../modules/types";
import {
  normalizeDeckButtonConfig,
  normalizeDeckLayout,
  type DeckButtonConfig,
  type DeckLayoutConfig,
} from "./deck";

export type WebDeckExportConfig = {
  schemaVersion: 1;
  exportedAt: string;
  modules: Array<{
    id: string;
    enabled: boolean;
    config: Record<string, string>;
  }>;
  customModuleUrls: string[];
  deckLayout: DeckLayoutConfig;
  deckButtons: Array<DeckButtonConfig | undefined>;
};

export function isWebDeckModule(value: unknown): value is WebDeckModule {
  if (!value || typeof value !== "object") {
    return false;
  }

  const module = value as Partial<WebDeckModule>;
  return (
    typeof module.id === "string" &&
    typeof module.name === "string" &&
    typeof module.description === "string" &&
    Array.isArray(module.configFields)
  );
}

export function normalizeExternalModule(namespace: ExternalModuleNamespace): WebDeckModule {
  const candidate = namespace.default ?? namespace.webDeckModule;
  if (!isWebDeckModule(candidate)) {
    throw new Error("Module does not match the WebDeck module API.");
  }
  return candidate;
}

export function normalizeStringRecord(value: object): Record<string, string> {
  return Object.fromEntries(
    Object.entries(value).filter(
      (entry): entry is [string, string] =>
        typeof entry[0] === "string" && typeof entry[1] === "string",
    ),
  );
}

export function normalizeImportedModuleConfig(
  value: unknown,
): WebDeckExportConfig["modules"][number] {
  if (!value || typeof value !== "object") {
    throw new Error("Module config entries must be objects.");
  }

  const moduleConfig = value as Partial<WebDeckExportConfig["modules"][number]>;
  if (typeof moduleConfig.id !== "string") {
    throw new Error("Module config entries must include an id.");
  }

  return {
    id: moduleConfig.id,
    enabled: moduleConfig.enabled === true,
    config:
      moduleConfig.config && typeof moduleConfig.config === "object" && !Array.isArray(moduleConfig.config)
        ? normalizeStringRecord(moduleConfig.config)
        : {},
  };
}

export function parseExportConfig(value: unknown): WebDeckExportConfig {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Imported config must contain a JSON object.");
  }

  const config = value as Partial<WebDeckExportConfig>;
  if (config.schemaVersion !== 1) throw new Error("Unsupported config version.");
  if (!Array.isArray(config.modules)) throw new Error("Import file is missing modules.");
  if (!Array.isArray(config.customModuleUrls)) {
    throw new Error("Import file is missing custom module URLs.");
  }
  if (!Array.isArray(config.deckButtons)) throw new Error("Import file is missing deck buttons.");

  const deckLayout = normalizeDeckLayout(config.deckLayout);
  return {
    schemaVersion: 1,
    exportedAt: typeof config.exportedAt === "string" ? config.exportedAt : "",
    modules: config.modules.map(normalizeImportedModuleConfig),
    customModuleUrls: config.customModuleUrls.filter(
      (url): url is string => typeof url === "string",
    ),
    deckLayout,
    deckButtons: Array.from(
      { length: Math.max(config.deckButtons.length, deckLayout.rows * deckLayout.columns) },
      (_, index) => normalizeDeckButtonConfig(config.deckButtons?.[index]),
    ),
  };
}
