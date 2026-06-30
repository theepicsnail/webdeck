import { expect, it, vi } from "vitest";

it("restores persisted modules and exercises images, spans, file import, console capture, and fullscreen", async () => {
  const source = `export default {
    id: "restore-fixture", name: "Restored", description: "Stored module",
    configFields: [{ key: "value", label: "Value", type: "text", defaultValue: "default" }],
    events: [{ id: "run", name: "Run", parameterFields: [], buildMessage: () => "run" }],
    createController(host) { let status = "disabled"; return {
      connect() { status = "connected"; host.setStatus(status); },
      disconnect() { status = "disabled"; host.setStatus(status); },
      dispose() { status = "disabled"; }, getStatus() { return status; },
      triggerEvent() { host.log("outgoing", "ran restored event"); }
    }; }
  };`;
  const moduleUrl = `data:text/javascript,${encodeURIComponent(source)}`;
  localStorage.setItem("webdeck.customModules", JSON.stringify([moduleUrl, 5]));
  localStorage.setItem("webdeck.enabled.restore-fixture", "true");
  localStorage.setItem("webdeck.config.restore-fixture", JSON.stringify({ value: "stored" }));
  localStorage.setItem("webdeck.deckLayout", JSON.stringify({ rows: 2, columns: 2 }));
  localStorage.setItem("webdeck.deckButtons", JSON.stringify([
    { label: "Restored button", columnSpan: 1, rowSpan: 1, moduleId: "restore-fixture", eventId: "run", params: {} },
    { label: "Collision", columnSpan: 1, rowSpan: 1, moduleId: "", eventId: "", params: {} },
    "invalid",
  ]));
  document.body.innerHTML = '<div id="app"></div>';

  let fullscreenElement: Element | null = null;
  Object.defineProperty(document, "fullscreenElement", {
    configurable: true,
    get: () => fullscreenElement,
  });
  Object.defineProperty(document, "exitFullscreen", {
    configurable: true,
    value: vi.fn(async () => {
      fullscreenElement = null;
      document.dispatchEvent(new Event("fullscreenchange"));
    }),
  });
  Object.defineProperty(URL, "createObjectURL", { configurable: true, value: vi.fn(() => "blob:image") });
  Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: vi.fn() });

  await import("../../src/main");
  await vi.waitFor(() => expect(document.querySelector("#statusText")?.textContent).toBe("1 connected"));
  expect(document.querySelector("#moduleGrid")?.textContent).toContain("Restored");
  expect(localStorage.getItem("webdeck.customModules")).toBe(JSON.stringify([moduleUrl, 5]));

  document.querySelector<HTMLButtonElement>('[data-view="deck"]')!.click();
  document.querySelector<HTMLButtonElement>('.deck-button[data-deck-index="0"]')!.click();
  expect(document.querySelector("#logList")?.textContent).toContain("ran restored event");
  document.querySelector<HTMLButtonElement>('.deck-button[data-deck-index="2"]')!.click();
  expect(document.querySelector("#logList")?.textContent).toContain("Button 3 is not configured");

  document.querySelector<HTMLInputElement>("#deckEditToggle")!.click();
  document.querySelector<HTMLButtonElement>('.deck-button[data-deck-index="0"]')!.click();
  const columnSpan = document.querySelector<HTMLInputElement>('[data-deck-config="column-span"]')!;
  columnSpan.value = "2";
  columnSpan.dispatchEvent(new Event("change", { bubbles: true }));
  expect(document.querySelector("#logList")?.textContent).toContain("span would cover another configured button");
  expect(document.querySelector<HTMLInputElement>('[data-deck-config="column-span"]')!.value).toBe("1");

  const imageUrl = document.querySelector<HTMLInputElement>('[data-deck-config="image-url"]')!;
  imageUrl.value = "  https://example.test/image.png  ";
  imageUrl.dispatchEvent(new Event("input", { bubbles: true }));
  expect(document.querySelector<HTMLImageElement>('.deck-button[data-deck-index="0"] img')?.src)
    .toBe("https://example.test/image.png");
  document.querySelector<HTMLButtonElement>('[data-action="remove-image"]')!.click();
  expect(document.querySelector('.deck-button[data-deck-index="0"] img')).toBeNull();

  const fileInput = document.querySelector<HTMLInputElement>('[data-deck-config="image-file"]')!;
  Object.defineProperty(fileInput, "files", {
    configurable: true,
    value: [new File(["text"], "not-image.txt", { type: "text/plain" })],
  });
  fileInput.dispatchEvent(new Event("change", { bubbles: true }));
  expect(document.querySelector("#logList")?.textContent).toContain("Choose an image file");

  const deckPanel = document.querySelector<HTMLElement>("#deckPanel")!;
  Object.defineProperty(deckPanel, "requestFullscreen", {
    configurable: true,
    value: vi.fn(async () => {
      fullscreenElement = deckPanel;
      document.dispatchEvent(new Event("fullscreenchange"));
    }),
  });
  document.querySelector<HTMLButtonElement>("#deckFullscreenButton")!.click();
  await vi.waitFor(() => expect(document.querySelector("#deckFullscreenButton")?.textContent).toBe("Exit Fullscreen"));
  document.querySelector<HTMLButtonElement>("#deckFullscreenButton")!.click();
  await vi.waitFor(() => expect(document.querySelector("#deckFullscreenButton")?.textContent).toBe("Fullscreen"));

  document.querySelector<HTMLButtonElement>('[data-view="system"]')!.click();
  console.log("captured", { value: 2 });
  expect(document.querySelector("#logList")?.textContent).toContain('captured {"value":2}');

  const imported = {
    schemaVersion: 1,
    exportedAt: "",
    modules: [{ id: "restore-fixture", enabled: false, config: { value: "imported" } }],
    customModuleUrls: [moduleUrl],
    deckLayout: { rows: 1, columns: 1 },
    deckButtons: [{ label: "Imported", moduleId: "", eventId: "", params: {} }],
  };
  const configFile = new File([JSON.stringify(imported)], "config.json", { type: "application/json" });
  Object.defineProperty(configFile, "text", {
    configurable: true,
    value: vi.fn(async () => JSON.stringify(imported)),
  });
  const configInput = document.querySelector<HTMLInputElement>("#importConfigInput")!;
  Object.defineProperty(configInput, "files", { configurable: true, value: [configFile] });
  configInput.dispatchEvent(new Event("change", { bubbles: true }));
  await vi.waitFor(() => expect(document.querySelector("#logList")?.textContent).toContain("Imported deck and module config from file"));
  expect(JSON.parse(localStorage.getItem("webdeck.deckLayout")!)).toEqual({ rows: 1, columns: 1 });
  expect(JSON.parse(localStorage.getItem("webdeck.config.restore-fixture")!)).toEqual({ value: "imported" });
  expect(localStorage.getItem("webdeck.enabled.restore-fixture")).toBe("false");
});
