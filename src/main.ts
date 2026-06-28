import type {
  WebDeckConnectionStatus,
  ExternalModuleNamespace,
  WebDeckConfigField,
  WebDeckModuleController,
  WebDeckModuleEvent,
  WebDeckModule,
} from "./modules/types";
import "./styles.css";

type LogEntry = {
  id: number;
  moduleName: string;
  direction: "system" | "incoming" | "outgoing" | "error" | "console";
  message: string;
  timestamp: Date;
};

type AppView = "modules" | "deck" | "system";
type AppTheme = "light" | "dark";

type ModuleRuntime = {
  module: WebDeckModule;
  config: Record<string, string>;
  controller: WebDeckModuleController;
  state: WebDeckConnectionStatus;
  enabled: boolean;
};

type DeckButtonConfig = {
  label: string;
  imageDataUrl?: string;
  imageUrl?: string;
  moduleId: string;
  eventId: string;
  params: Record<string, string>;
};

type WebDeckExportConfig = {
  schemaVersion: 1;
  exportedAt: string;
  modules: Array<{
    id: string;
    enabled: boolean;
    config: Record<string, string>;
  }>;
  customModuleUrls: string[];
  deckButtons: Array<DeckButtonConfig | undefined>;
};

const CONFIG_STORAGE_PREFIX = "webdeck.config.";
const ENABLED_STORAGE_PREFIX = "webdeck.enabled.";
const CUSTOM_MODULES_STORAGE_KEY = "webdeck.customModules";
const DECK_STORAGE_KEY = "webdeck.deckButtons";
const THEME_STORAGE_KEY = "webdeck.theme";
const BUILT_IN_MODULE_URLS = import.meta.env.DEV
  ? ["/src/modules/obs.ts", "/src/modules/warudo.ts", "/src/modules/vtube-studio.ts"]
  : ["./obs.js", "./warudo.js", "./vtube-studio.js"];

let runtimes: ModuleRuntime[] = [];
let logs: LogEntry[] = [];
let nextLogId = 1;
let settingsModuleId: string | null = null;
let activeView: AppView = "modules";
let appTheme: AppTheme = readStoredTheme();
let isDeckEditMode = false;
let isDeckFullscreen = false;
let selectedDeckButton = 0;
let deckButtons = readStoredDeckButtons();

const app = document.querySelector<HTMLDivElement>("#app");

if (!app) {
  throw new Error("Missing #app root element.");
}

const appRoot = app;

appRoot.innerHTML = `
  <main class="shell">
    <section class="workspace" aria-labelledby="page-title">
      <header class="app-chrome">
        <nav class="view-tabs" aria-label="Primary views">
          <button class="tab-button" data-view="modules" type="button">Modules</button>
          <button class="tab-button" data-view="deck" type="button">Deck</button>
          <button class="tab-button" data-view="system" type="button">System</button>
        </nav>
        <div class="status-pill" data-state="disabled" id="statusPill">
          <span class="status-dot" aria-hidden="true"></span>
          <span id="statusText">0 connected</span>
        </div>
      </header>

      <section class="view-panel" data-view-panel="modules">
        <section class="custom-loader" aria-labelledby="custom-title">
          <div>
            <h2 id="custom-title">Load Module URL</h2>
            <p>Third-party modules must be browser ESM and export a WebDeck module as default or webDeckModule.</p>
          </div>
          <form id="customModuleForm" class="custom-form">
            <label class="field">
              <span>Module URL</span>
              <input
                id="customModuleUrlInput"
                type="url"
                inputmode="url"
                spellcheck="false"
                autocomplete="off"
                placeholder="https://example.com/webdeck-module.js"
              />
            </label>
            <button class="secondary" type="submit">Load</button>
          </form>
        </section>

        <section class="module-section" aria-labelledby="module-title">
          <div class="section-header">
            <h2 id="module-title">Modules</h2>
            <p id="moduleSummary">Toggle modules on to connect them simultaneously.</p>
          </div>
          <div class="module-grid" id="moduleGrid"></div>
        </section>
      </section>

      <section class="view-panel deck-panel" data-view-panel="deck" id="deckPanel">
        <div class="deck-toolbar">
          <div class="deck-toolbar-controls">
            <label class="switch deck-edit-control">
              <input id="deckEditToggle" type="checkbox" />
              <span>Edit Mode</span>
            </label>
            <button class="secondary" id="deckFullscreenButton" type="button">Fullscreen</button>
          </div>
        </div>
        <div class="deck-layout" id="deckLayout">
          <div class="deck-grid" id="deckGrid"></div>
          <aside class="deck-config-panel" id="deckConfigPanel"></aside>
        </div>
      </section>

      <section class="view-panel" data-view-panel="system">
        <section class="system-panel" aria-labelledby="system-title">
          <div class="section-header">
            <div>
              <h2 id="system-title">System</h2>
              <p>Manage the app appearance and saved deck/module config.</p>
            </div>
          </div>
          <div class="system-actions">
            <label class="switch">
              <input id="themeToggle" type="checkbox" />
              <span id="themeLabel">Light Mode</span>
            </label>
            <div class="config-file-actions">
              <button class="secondary" id="importConfigButton" type="button">Import</button>
              <button class="primary" id="exportConfigButton" type="button">Export</button>
              <input id="importConfigInput" type="file" accept="application/json,.json" hidden />
            </div>
          </div>
        </section>
        <section class="log-panel" aria-labelledby="log-title">
          <div class="log-header">
            <h2 id="log-title">Connection Log</h2>
            <div class="log-actions">
              <span id="logCount">0 events</span>
              <button class="secondary" id="clearButton" type="button">Clear Log</button>
            </div>
          </div>
          <ol class="log-list" id="logList"></ol>
        </section>
      </section>
    </section>
  </main>
`;

const statusPill = query<HTMLDivElement>("#statusPill");
const statusText = query<HTMLSpanElement>("#statusText");
const customModuleForm = query<HTMLFormElement>("#customModuleForm");
const customModuleUrlInput = query<HTMLInputElement>("#customModuleUrlInput");
const moduleGrid = query<HTMLDivElement>("#moduleGrid");
const deckPanel = query<HTMLElement>("#deckPanel");
const deckEditToggle = query<HTMLInputElement>("#deckEditToggle");
const deckFullscreenButton = query<HTMLButtonElement>("#deckFullscreenButton");
const themeToggle = query<HTMLInputElement>("#themeToggle");
const themeLabel = query<HTMLSpanElement>("#themeLabel");
const importConfigButton = query<HTMLButtonElement>("#importConfigButton");
const exportConfigButton = query<HTMLButtonElement>("#exportConfigButton");
const importConfigInput = query<HTMLInputElement>("#importConfigInput");
const deckLayout = query<HTMLDivElement>("#deckLayout");
const deckGrid = query<HTMLDivElement>("#deckGrid");
const deckConfigPanel = query<HTMLElement>("#deckConfigPanel");
const clearButton = query<HTMLButtonElement>("#clearButton");
const logList = query<HTMLOListElement>("#logList");
const logCount = query<HTMLSpanElement>("#logCount");
const tabButtons = [...appRoot.querySelectorAll<HTMLButtonElement>(".tab-button")];
const viewPanels = [...appRoot.querySelectorAll<HTMLElement>("[data-view-panel]")];

installConsoleCapture();
applyTheme();

for (const button of tabButtons) {
  button.addEventListener("click", () => {
    const view = button.dataset.view;

    if (view === "modules" || view === "deck" || view === "system") {
      activeView = view;
      render();
    }
  });
}

customModuleForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  await loadCustomModule(customModuleUrlInput.value.trim());
});

moduleGrid.addEventListener("input", (event) => {
  const input = event.target;

  if (!(input instanceof HTMLInputElement) || !input.dataset.configKey) {
    return;
  }

  const runtime = findRuntime(input.dataset.moduleId);

  if (!runtime) {
    return;
  }

  runtime.config[input.dataset.configKey] = input.value;
  saveRuntimeConfig(runtime);
});

moduleGrid.addEventListener("click", (event) => {
  const target = event.target;

  if (target instanceof HTMLInputElement) {
    return;
  }

  if (target instanceof Element && target.closest(".switch")) {
    return;
  }

  if (target instanceof HTMLButtonElement && target.dataset.action === "back") {
    settingsModuleId = null;
    render();
    return;
  }

  const card = target instanceof Element ? target.closest<HTMLElement>(".module-card") : null;

  if (card?.dataset.moduleId) {
    settingsModuleId = card.dataset.moduleId;
    render();
  }
});

moduleGrid.addEventListener("keydown", (event) => {
  if (event.key !== "Enter" && event.key !== " ") {
    return;
  }

  const card =
    event.target instanceof Element
      ? event.target.closest<HTMLElement>(".module-card")
      : null;

  if (!card?.dataset.moduleId) {
    return;
  }

  event.preventDefault();
  settingsModuleId = card.dataset.moduleId;
  render();
});

moduleGrid.addEventListener("change", (event) => {
  const input = event.target;

  if (!(input instanceof HTMLInputElement) || input.dataset.action !== "toggle") {
    return;
  }

  const runtime = findRuntime(input.dataset.moduleId);

  if (!runtime) {
    return;
  }

  void setModuleEnabled(runtime, input.checked);
});

deckEditToggle.addEventListener("change", () => {
  isDeckEditMode = deckEditToggle.checked;
  render();
});

deckFullscreenButton.addEventListener("click", async () => {
  try {
    if (document.fullscreenElement) {
      await document.exitFullscreen();
    } else {
      await deckPanel.requestFullscreen();
    }
  } catch (error) {
    addLog("error", "Deck", `Could not change fullscreen mode: ${errorMessage(error)}`);
    renderLogs();
  }
});

document.addEventListener("fullscreenchange", () => {
  isDeckFullscreen = document.fullscreenElement === deckPanel;
  renderDeck();
});

themeToggle.addEventListener("change", () => {
  appTheme = themeToggle.checked ? "dark" : "light";
  localStorage.setItem(THEME_STORAGE_KEY, appTheme);
  applyTheme();
  render();
});

exportConfigButton.addEventListener("click", () => {
  exportDeckConfig();
});

importConfigButton.addEventListener("click", () => {
  importConfigInput.click();
});

importConfigInput.addEventListener("change", async () => {
  const file = importConfigInput.files?.[0];
  importConfigInput.value = "";

  if (!file) {
    return;
  }

  await importDeckConfig(file);
});

deckGrid.addEventListener("click", (event) => {
  const button = event.target instanceof Element
    ? event.target.closest<HTMLButtonElement>(".deck-button")
    : null;

  if (!button?.dataset.deckIndex) {
    return;
  }

  selectedDeckButton = Number(button.dataset.deckIndex);

  if (isDeckEditMode) {
    renderDeck();
    return;
  }

  triggerDeckButton(selectedDeckButton);
});

deckConfigPanel.addEventListener("input", (event) => {
  const input = event.target;

  if (!(input instanceof HTMLInputElement)) {
    return;
  }

  const config = deckButtons[selectedDeckButton] ?? createEmptyDeckButtonConfig();

  if (input.dataset.deckConfig === "label") {
    config.label = input.value;
  }

  if (input.dataset.deckConfig === "image-url") {
    config.imageUrl = input.value.trim();

    if (config.imageUrl) {
      delete config.imageDataUrl;
    }
  }

  if (input.dataset.paramKey) {
    config.params[input.dataset.paramKey] = input.value;
  }

  deckButtons[selectedDeckButton] = config;
  saveDeckButtons();
  renderDeckButtons();
});

deckConfigPanel.addEventListener("change", (event) => {
  const target = event.target;

  if (target instanceof HTMLInputElement && target.dataset.deckConfig === "image-file") {
    const file = target.files?.[0];
    target.value = "";

    if (file) {
      void updateDeckButtonImage(file);
    }

    return;
  }

  if (!(target instanceof HTMLSelectElement)) {
    return;
  }

  const config = deckButtons[selectedDeckButton] ?? createEmptyDeckButtonConfig();

  if (target.dataset.deckConfig === "module") {
    config.moduleId = target.value;
    const event = findFirstEvent(config.moduleId);
    config.eventId = event?.id ?? "";
    config.params = defaultEventParams(event);
  }

  if (target.dataset.deckConfig === "event") {
    config.eventId = target.value;
    config.params = defaultEventParams(findEvent(config.moduleId, config.eventId));
  }

  deckButtons[selectedDeckButton] = config;
  saveDeckButtons();
  renderDeck();
});

deckConfigPanel.addEventListener("click", (event) => {
  const button = event.target;

  if (!(button instanceof HTMLButtonElement)) {
    return;
  }

  if (button.dataset.action === "remove-image") {
    removeDeckButtonImage();
    return;
  }

  if (button.dataset.action !== "test-event") {
    return;
  }

  triggerDeckButton(selectedDeckButton);
});

clearButton.addEventListener("click", () => {
  logs = [];
  addLog("system", "System", "Log cleared.");
  render();
});

window.addEventListener("beforeunload", () => {
  for (const runtime of runtimes) {
    void runtime.controller.dispose?.();
  }
});

render();
void initializeApp();

async function initializeApp(): Promise<void> {
  await restoreModules();
  addLog("system", "System", "Ready. Toggle any module on to connect it.");
  render();
}

function query<T extends Element>(selector: string): T {
  const element = appRoot.querySelector<T>(selector);

  if (!element) {
    throw new Error(`Missing required element: ${selector}`);
  }

  return element;
}

function createRuntime(module: WebDeckModule): ModuleRuntime {
  const runtime: ModuleRuntime = {
    module,
    config: readStoredConfig(module),
    controller: createFallbackController(),
    state: "disabled",
    enabled: readStoredEnabled(module),
  };

  runtime.controller = createController(module, runtime);

  return runtime;
}

function createController(
  module: WebDeckModule,
  runtime: ModuleRuntime,
): WebDeckModuleController {
  if (!module.createController) {
    return createFallbackController();
  }

  return module.createController({
    getConfig: () => runtime.config,
    setConfigValue: (key, value) => {
      runtime.config[key] = value;
      saveRuntimeConfig(runtime);
    },
    setStatus: (status) => {
      runtime.state = status;
      render();
    },
    log: (direction, message) => {
      addLog(direction, runtime.module.name, message);
      renderLogs();
    },
  });
}

function createFallbackController(): WebDeckModuleController {
  return {
    getStatus: () => "disabled",
  };
}

async function restoreModules(): Promise<void> {
  for (const url of BUILT_IN_MODULE_URLS) {
    await loadCustomModule(url, false);
  }

  const storedUrls = readStoredCustomModuleUrls();

  for (const url of storedUrls) {
    await loadCustomModule(url, false);
  }

  for (const runtime of runtimes.filter((candidate) => candidate.enabled)) {
    void runtime.controller.connect?.();
  }
}

async function loadCustomModule(rawUrl: string, shouldRemember = true): Promise<void> {
  if (!rawUrl) {
    return;
  }

  let url: URL;

  try {
    url = new URL(rawUrl, window.location.href);
  } catch {
    addLog("error", "System", "Enter a valid module URL.");
    render();
    return;
  }

  try {
    const namespace = (await import(/* @vite-ignore */ url.toString())) as ExternalModuleNamespace;
    const module = normalizeExternalModule(namespace);
    const existing = findRuntime(module.id);
    const runtime = existing ?? createRuntime(module);

    void runtime.controller.dispose?.();
    runtime.module = module;
    runtime.config = { ...defaultConfig(module), ...runtime.config };
    runtime.controller = createController(module, runtime);
    runtime.state = runtime.controller.getStatus();

    if (!existing) {
      runtimes = [...runtimes, runtime];
    }

    if (shouldRemember) {
      rememberCustomModuleUrl(url.toString());
      customModuleUrlInput.value = "";
    }

    addLog("system", module.name, "Loaded module.");
    render();
  } catch (error) {
    addLog("error", "System", `Could not load module: ${errorMessage(error)}`);
    render();
  }
}

function normalizeExternalModule(namespace: ExternalModuleNamespace): WebDeckModule {
  const candidate = namespace.default ?? namespace.webDeckModule;

  if (!isWebDeckModule(candidate)) {
    throw new Error("Module does not match the WebDeck module API.");
  }

  return candidate;
}

function isWebDeckModule(value: unknown): value is WebDeckModule {
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

async function setModuleEnabled(
  runtime: ModuleRuntime,
  enabled: boolean,
): Promise<void> {
  runtime.enabled = enabled;
  localStorage.setItem(`${ENABLED_STORAGE_PREFIX}${runtime.module.id}`, String(enabled));

  if (enabled) {
    saveRuntimeConfig(runtime);
    await runtime.controller.connect?.();
    runtime.state = runtime.controller.getStatus();
    render();
    return;
  }

  await runtime.controller.disconnect?.();
  runtime.state = runtime.controller.getStatus();
  render();
}

function addLog(
  direction: LogEntry["direction"],
  moduleName: string,
  message: string,
): void {
  logs = [
    {
      id: nextLogId,
      direction,
      moduleName,
      message,
      timestamp: new Date(),
    },
    ...logs,
  ].slice(0, 300);

  nextLogId += 1;
}

function render(): void {
  renderTheme();
  renderStatus();
  renderViews();
  renderModules();
  renderDeck();
  renderLogs();
}

function applyTheme(): void {
  document.documentElement.dataset.theme = appTheme;
}

function renderTheme(): void {
  themeToggle.checked = appTheme === "dark";
  themeLabel.textContent = appTheme === "dark" ? "Dark Mode" : "Light Mode";
}

function renderViews(): void {
  for (const button of tabButtons) {
    button.classList.toggle("active", button.dataset.view === activeView);
    button.setAttribute("aria-current", button.dataset.view === activeView ? "page" : "false");
  }

  for (const panel of viewPanels) {
    panel.hidden = panel.dataset.viewPanel !== activeView;
  }
}

function renderStatus(): void {
  const connected = runtimes.filter((runtime) => runtime.state === "connected").length;
  const connecting = runtimes.filter((runtime) => runtime.state === "connecting").length;
  const errored = runtimes.filter((runtime) => runtime.state === "error").length;

  statusPill.dataset.state =
    connected > 0 ? "connected" : connecting > 0 ? "connecting" : errored > 0 ? "error" : "disabled";
  statusText.textContent = `${connected} connected`;
}

function renderModules(): void {
  const settingsRuntime = findRuntime(settingsModuleId ?? undefined);

  moduleGrid.innerHTML = settingsRuntime
    ? renderSettingsPage(settingsRuntime)
    : runtimes.map(renderModuleCard).join("");
}

function renderModuleCard(runtime: ModuleRuntime): string {
  return `
    <article
      class="module-card"
      data-state="${runtime.state}"
      data-module-id="${escapeHtml(runtime.module.id)}"
      tabindex="0"
    >
      <div class="module-card-header">
        <div class="module-title-row">
          <span class="status-dot" aria-hidden="true"></span>
          <h3>${escapeHtml(runtime.module.name)}</h3>
        </div>
        <label class="switch">
          <input
            data-action="toggle"
            data-module-id="${escapeHtml(runtime.module.id)}"
            type="checkbox"
            ${runtime.enabled ? "checked" : ""}
          />
          <span>${runtime.enabled ? "On" : "Off"}</span>
        </label>
      </div>
    </article>
  `;
}

function renderSettingsPage(runtime: ModuleRuntime): string {
  return `
    <article class="settings-page" data-state="${runtime.state}">
      <div class="settings-header">
        <button class="secondary" data-action="back" type="button">Back</button>
        <div>
          <h3>${escapeHtml(runtime.module.name)} Settings</h3>
          <p>${escapeHtml(runtime.module.description)}</p>
        </div>
        <label class="switch">
          <input
            data-action="toggle"
            data-module-id="${escapeHtml(runtime.module.id)}"
            type="checkbox"
            ${runtime.enabled ? "checked" : ""}
          />
          <span>${runtime.enabled ? "On" : "Off"}</span>
        </label>
      </div>
      <div class="module-state">
        <span class="status-dot" aria-hidden="true"></span>
        <span>${stateLabel(runtime.state)}</span>
      </div>
      <div class="config-grid settings-grid">
        ${runtime.module.configFields
          .map((field) => renderConfigField(runtime, field))
          .join("")}
      </div>
    </article>
  `;
}

function renderConfigField(
  runtime: ModuleRuntime,
  field: WebDeckConfigField,
): string {
  const value = runtime.config[field.key] ?? field.defaultValue;

  return `
    <label class="field">
      <span>${escapeHtml(field.label)}</span>
      <input
        data-module-id="${escapeHtml(runtime.module.id)}"
        data-config-key="${escapeHtml(field.key)}"
        type="${field.type}"
        value="${escapeHtml(value)}"
        placeholder="${escapeHtml(field.placeholder ?? field.defaultValue)}"
        ${field.required ? "required" : ""}
      />
    </label>
  `;
}

function renderDeck(): void {
  deckEditToggle.checked = isDeckEditMode;
  deckPanel.dataset.fullscreen = String(isDeckFullscreen);
  deckLayout.dataset.editMode = String(isDeckEditMode);
  document.body.classList.toggle("deck-fullscreen", isDeckFullscreen);
  deckFullscreenButton.textContent = isDeckFullscreen ? "Exit Fullscreen" : "Fullscreen";
  deckFullscreenButton.setAttribute("aria-pressed", String(isDeckFullscreen));
  deckConfigPanel.hidden = !isDeckEditMode;
  renderDeckButtons();
  deckConfigPanel.innerHTML = isDeckEditMode ? renderDeckConfigPanel() : "";
}

function renderDeckButtons(): void {
  deckGrid.innerHTML = Array.from({ length: 64 }, (_, index) => {
    const config = deckButtons[index];
    const label = deckButtonLabel(index, config);
    const imageSource = deckButtonImageSource(config);

    return `
      <button
        class="deck-button ${imageSource ? "has-image" : ""} ${isDeckEditMode && selectedDeckButton === index ? "selected" : ""}"
        data-deck-index="${index}"
        type="button"
      >
        ${imageSource ? `<img src="${escapeHtml(imageSource)}" alt="" />` : ""}
        <span>${escapeHtml(label)}</span>
      </button>
    `;
  }).join("");
}

function renderLogs(): void {
  logCount.textContent = `${logs.length} ${logs.length === 1 ? "event" : "events"}`;

  logList.innerHTML = logs
    .map(
      (entry) => `
        <li class="log-entry" data-direction="${entry.direction}">
          <div class="log-meta">
            <span>${escapeHtml(entry.moduleName)} - ${entry.direction}</span>
            <time datetime="${entry.timestamp.toISOString()}">
              ${entry.timestamp.toLocaleTimeString()}
            </time>
          </div>
          <pre>${escapeHtml(entry.message)}</pre>
        </li>
      `,
    )
    .join("");
}

function installConsoleCapture(): void {
  const originalLog = console.log.bind(console);
  const originalWarn = console.warn.bind(console);
  const originalError = console.error.bind(console);

  console.log = (...args: unknown[]) => {
    originalLog(...args);
    addLog("console", "Console", args.map(formatConsoleValue).join(" "));
    renderLogs();
  };

  console.warn = (...args: unknown[]) => {
    originalWarn(...args);
    addLog("console", "Console", args.map(formatConsoleValue).join(" "));
    renderLogs();
  };

  console.error = (...args: unknown[]) => {
    originalError(...args);
    addLog("error", "Console", args.map(formatConsoleValue).join(" "));
    renderLogs();
  };
}

function renderDeckConfigPanel(): string {
  const config = deckButtons[selectedDeckButton] ?? createEmptyDeckButtonConfig();
  const selectedModule = findRuntime(config.moduleId);
  const availableModules = runtimes.filter((runtime) => runtime.module.events?.length);
  const selectedEvent =
    selectedModule && config.eventId
      ? findEvent(selectedModule.module.id, config.eventId)
      : findFirstEvent(config.moduleId);

  return `
    <div class="deck-config-header">
      <h2>Button ${selectedDeckButton + 1}</h2>
      <p>${selectedEvent?.description ?? "Choose a module and event for this button."}</p>
    </div>
    <label class="field">
      <span>Button Label</span>
      <input
        data-deck-config="label"
        type="text"
        value="${escapeHtml(config.label)}"
        placeholder="Button ${selectedDeckButton + 1}"
      />
    </label>
    <div class="image-field">
      <span>Button Image</span>
      <div class="image-actions">
        <label class="image-upload">
          <input data-deck-config="image-file" type="file" accept="image/*" />
          <span>${config.imageDataUrl ? "Replace Local Image" : "Choose Local Image"}</span>
        </label>
        <button
          class="secondary"
          data-action="remove-image"
          type="button"
          ${deckButtonImageSource(config) ? "" : "disabled"}
        >
          Remove
        </button>
      </div>
    </div>
    <label class="field">
      <span>Image URL</span>
      <input
        data-deck-config="image-url"
        type="url"
        inputmode="url"
        spellcheck="false"
        value="${escapeHtml(config.imageUrl ?? "")}"
        placeholder="https://example.com/button.png"
      />
    </label>
    <label class="field">
      <span>Module</span>
      <select data-deck-config="module">
        <option value="">None</option>
        ${availableModules
          .map(
            (runtime) =>
              `<option value="${escapeHtml(runtime.module.id)}" ${runtime.module.id === config.moduleId ? "selected" : ""}>${escapeHtml(runtime.module.name)}</option>`,
          )
          .join("")}
      </select>
    </label>
    <label class="field">
      <span>Event</span>
      <select data-deck-config="event" ${selectedModule ? "" : "disabled"}>
        <option value="">None</option>
        ${(selectedModule?.module.events ?? [])
          .map(
            (event) =>
              `<option value="${escapeHtml(event.id)}" ${event.id === config.eventId ? "selected" : ""}>${escapeHtml(event.name)}</option>`,
          )
          .join("")}
      </select>
    </label>
    <div class="config-grid">
      ${(selectedEvent?.parameterFields ?? [])
        .map((field) => renderDeckParameterField(field, config.params[field.key] ?? field.defaultValue))
        .join("")}
    </div>
    <button class="primary" data-action="test-event" type="button">Test Event</button>
  `;
}

function renderDeckParameterField(field: WebDeckConfigField, value: string): string {
  return `
    <label class="field">
      <span>${escapeHtml(field.label)}</span>
      <input
        data-param-key="${escapeHtml(field.key)}"
        type="${field.type}"
        value="${escapeHtml(value)}"
        placeholder="${escapeHtml(field.placeholder ?? field.defaultValue)}"
        ${field.required ? "required" : ""}
      />
    </label>
  `;
}

function triggerDeckButton(index: number): void {
  const config = deckButtons[index];

  if (!config?.moduleId || !config.eventId) {
    addLog("system", "Deck", `Button ${index + 1} is not configured.`);
    renderLogs();
    return;
  }

  const runtime = findRuntime(config.moduleId);
  const event = findEvent(config.moduleId, config.eventId);

  if (!runtime || !event) {
    addLog("error", "Deck", `Button ${index + 1} references a missing module or event.`);
    renderLogs();
    return;
  }

  if (!runtime.controller.triggerEvent) {
    addLog("system", runtime.module.name, `${event.name} is not supported by this module.`);
    renderLogs();
    return;
  }

  void runtime.controller.triggerEvent(event, config.params);
}

function deckButtonLabel(index: number, config: DeckButtonConfig | undefined): string {
  if (config?.label.trim()) {
    return config.label;
  }

  if (!config?.moduleId || !config.eventId) {
    return String(index + 1);
  }

  const event = findEvent(config.moduleId, config.eventId);

  return event?.name ?? String(index + 1);
}

function deckButtonImageSource(config: DeckButtonConfig | undefined): string {
  return config?.imageDataUrl ?? config?.imageUrl ?? "";
}

function createEmptyDeckButtonConfig(): DeckButtonConfig {
  return {
    label: "",
    moduleId: "",
    eventId: "",
    params: {},
  };
}

async function updateDeckButtonImage(file: File): Promise<void> {
  if (!file.type.startsWith("image/")) {
    addLog("error", "Deck", "Choose an image file for the button.");
    renderLogs();
    return;
  }

  try {
    const config = deckButtons[selectedDeckButton] ?? createEmptyDeckButtonConfig();
    config.imageDataUrl = await resizeImageFile(file, 512);
    delete config.imageUrl;
    deckButtons[selectedDeckButton] = config;
    saveDeckButtons();
    renderDeck();
  } catch (error) {
    addLog("error", "Deck", `Could not load image: ${errorMessage(error)}`);
    renderLogs();
  }
}

function removeDeckButtonImage(): void {
  const config = deckButtons[selectedDeckButton];

  if (!config) {
    return;
  }

  delete config.imageDataUrl;
  delete config.imageUrl;
  saveDeckButtons();
  renderDeck();
}

async function resizeImageFile(file: File, maxSize: number): Promise<string> {
  const image = await loadImage(file);
  const scale = Math.min(1, maxSize / Math.max(image.naturalWidth, image.naturalHeight));
  const width = Math.max(1, Math.round(image.naturalWidth * scale));
  const height = Math.max(1, Math.round(image.naturalHeight * scale));
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");

  if (!context) {
    throw new Error("Image resizing is not supported in this browser.");
  }

  canvas.width = width;
  canvas.height = height;
  context.drawImage(image, 0, 0, width, height);

  return canvas.toDataURL("image/webp", 0.86);
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();

    image.addEventListener(
      "load",
      () => {
        URL.revokeObjectURL(url);
        resolve(image);
      },
      { once: true },
    );

    image.addEventListener(
      "error",
      () => {
        URL.revokeObjectURL(url);
        reject(new Error("The selected file could not be decoded."));
      },
      { once: true },
    );

    image.src = url;
  });
}

function createExportConfig(): WebDeckExportConfig {
  return {
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    modules: runtimes.map((runtime) => ({
      id: runtime.module.id,
      enabled: runtime.enabled,
      config: runtime.config,
    })),
    customModuleUrls: readStoredCustomModuleUrls(),
    deckButtons,
  };
}

function exportDeckConfig(): void {
  const json = JSON.stringify(createExportConfig(), null, 2);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = `webdeck-config-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);

  addLog("system", "Deck", "Exported deck and module config.");
  renderLogs();
}

async function importDeckConfig(file: File): Promise<void> {
  try {
    const imported = parseExportConfig(JSON.parse(await file.text()));
    await applyExportConfig(imported);
    addLog("system", "Deck", "Imported deck and module config.");
  } catch (error) {
    addLog("error", "Deck", `Could not import config: ${errorMessage(error)}`);
  }

  render();
}

async function applyExportConfig(imported: WebDeckExportConfig): Promise<void> {
  localStorage.setItem(CUSTOM_MODULES_STORAGE_KEY, JSON.stringify(imported.customModuleUrls));
  deckButtons = Array.from({ length: 64 }, (_, index) =>
    normalizeDeckButtonConfig(imported.deckButtons[index]),
  );
  saveDeckButtons();

  for (const url of imported.customModuleUrls) {
    await loadCustomModule(url, false);
  }

  for (const moduleConfig of imported.modules) {
    const runtime = findRuntime(moduleConfig.id);

    localStorage.setItem(
      `${CONFIG_STORAGE_PREFIX}${moduleConfig.id}`,
      JSON.stringify(moduleConfig.config),
    );
    localStorage.setItem(
      `${ENABLED_STORAGE_PREFIX}${moduleConfig.id}`,
      String(moduleConfig.enabled),
    );

    if (!runtime) {
      continue;
    }

    runtime.config = { ...defaultConfig(runtime.module), ...moduleConfig.config };
    saveRuntimeConfig(runtime);

    if (runtime.enabled !== moduleConfig.enabled) {
      await setModuleEnabled(runtime, moduleConfig.enabled);
      continue;
    }

    runtime.enabled = moduleConfig.enabled;
  }
}

function parseExportConfig(value: unknown): WebDeckExportConfig {
  if (!value || typeof value !== "object") {
    throw new Error("Import file must contain a JSON object.");
  }

  const config = value as Partial<WebDeckExportConfig>;

  if (config.schemaVersion !== 1) {
    throw new Error("Unsupported config version.");
  }

  if (!Array.isArray(config.modules)) {
    throw new Error("Import file is missing modules.");
  }

  if (!Array.isArray(config.customModuleUrls)) {
    throw new Error("Import file is missing custom module URLs.");
  }

  if (!Array.isArray(config.deckButtons)) {
    throw new Error("Import file is missing deck buttons.");
  }

  return {
    schemaVersion: 1,
    exportedAt: typeof config.exportedAt === "string" ? config.exportedAt : "",
    modules: config.modules.map(normalizeImportedModuleConfig),
    customModuleUrls: config.customModuleUrls.filter(
      (url): url is string => typeof url === "string",
    ),
    deckButtons: Array.from({ length: 64 }, (_, index) =>
      normalizeDeckButtonConfig(config.deckButtons?.[index]),
    ),
  };
}

function normalizeImportedModuleConfig(
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

function normalizeStringRecord(value: object): Record<string, string> {
  return Object.fromEntries(
    Object.entries(value).filter(
      (entry): entry is [string, string] =>
        typeof entry[0] === "string" && typeof entry[1] === "string",
    ),
  );
}

function findEvent(moduleId: string, eventId: string): WebDeckModuleEvent | undefined {
  return findRuntime(moduleId)?.module.events?.find((event) => event.id === eventId);
}

function findFirstEvent(moduleId: string): WebDeckModuleEvent | undefined {
  return findRuntime(moduleId)?.module.events?.[0];
}

function defaultEventParams(event: WebDeckModuleEvent | undefined): Record<string, string> {
  return Object.fromEntries(
    (event?.parameterFields ?? []).map((field) => [field.key, field.defaultValue]),
  );
}

function readStoredDeckButtons(): Array<DeckButtonConfig | undefined> {
  const stored = localStorage.getItem(DECK_STORAGE_KEY);

  if (!stored) {
    return Array.from({ length: 64 });
  }

  try {
    const parsed = JSON.parse(stored) as unknown;

    if (Array.isArray(parsed)) {
      return Array.from({ length: 64 }, (_, index) =>
        normalizeDeckButtonConfig(parsed[index]),
      );
    }
  } catch {
    return Array.from({ length: 64 });
  }

  return Array.from({ length: 64 });
}

function isDeckButtonConfig(value: unknown): value is DeckButtonConfig {
  if (!value || typeof value !== "object") {
    return false;
  }

  const config = value as Partial<DeckButtonConfig>;

  return (
    (typeof config.label === "string" || typeof config.label === "undefined") &&
    typeof config.moduleId === "string" &&
    typeof config.eventId === "string" &&
    !!config.params &&
    typeof config.params === "object" &&
    !Array.isArray(config.params)
  );
}

function normalizeDeckButtonConfig(value: unknown): DeckButtonConfig | undefined {
  if (!isDeckButtonConfig(value)) {
    return undefined;
  }

  return {
    label: value.label ?? "",
    imageDataUrl: typeof value.imageDataUrl === "string" ? value.imageDataUrl : undefined,
    imageUrl: typeof value.imageUrl === "string" ? value.imageUrl : undefined,
    moduleId: value.moduleId,
    eventId: value.eventId,
    params: value.params,
  };
}

function saveDeckButtons(): void {
  localStorage.setItem(DECK_STORAGE_KEY, JSON.stringify(deckButtons));
}

function formatConsoleValue(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }

  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return String(value);
  }
}

function findRuntime(moduleId: string | undefined): ModuleRuntime | undefined {
  return runtimes.find((runtime) => runtime.module.id === moduleId);
}

function defaultConfig(module: WebDeckModule): Record<string, string> {
  return Object.fromEntries(
    module.configFields.map((field) => [field.key, field.defaultValue]),
  );
}

function readStoredConfig(module: WebDeckModule): Record<string, string> {
  const stored = localStorage.getItem(`${CONFIG_STORAGE_PREFIX}${module.id}`);

  if (!stored) {
    return defaultConfig(module);
  }

  try {
    const parsed = JSON.parse(stored) as unknown;

    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return { ...defaultConfig(module), ...(parsed as Record<string, string>) };
    }
  } catch {
    return defaultConfig(module);
  }

  return defaultConfig(module);
}

function saveRuntimeConfig(runtime: ModuleRuntime): void {
  localStorage.setItem(
    `${CONFIG_STORAGE_PREFIX}${runtime.module.id}`,
    JSON.stringify(runtime.config),
  );
}

function readStoredEnabled(module: WebDeckModule): boolean {
  return localStorage.getItem(`${ENABLED_STORAGE_PREFIX}${module.id}`) === "true";
}

function readStoredTheme(): AppTheme {
  return localStorage.getItem(THEME_STORAGE_KEY) === "light" ? "light" : "dark";
}

function readStoredCustomModuleUrls(): string[] {
  const stored = localStorage.getItem(CUSTOM_MODULES_STORAGE_KEY);

  if (!stored) {
    return [];
  }

  try {
    const urls = JSON.parse(stored) as unknown;

    return Array.isArray(urls)
      ? urls.filter((url): url is string => typeof url === "string")
      : [];
  } catch {
    return [];
  }
}

function rememberCustomModuleUrl(url: string): void {
  const urls = new Set(readStoredCustomModuleUrls());
  urls.add(url);
  localStorage.setItem(CUSTOM_MODULES_STORAGE_KEY, JSON.stringify([...urls]));
}

function stateLabel(state: WebDeckConnectionStatus): string {
  if (state === "connecting") {
    return "Connecting";
  }

  if (state === "connected") {
    return "Connected";
  }

  if (state === "error") {
    return "Error";
  }

  return "Disabled";
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
