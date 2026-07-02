import { expect, it, vi } from "vitest";

const click = (selector: string) => {
  const element = document.querySelector<HTMLElement>(selector);
  if (!element) throw new Error(`Missing ${selector}`);
  element.click();
  return element;
};

it("runs the application navigation, theme, deck, import, export, fullscreen, and log flows", async () => {
  localStorage.setItem("webdeck.theme", "light");
  localStorage.setItem("webdeck.deckLayout", JSON.stringify({ rows: 2, columns: 3 }));
  document.body.innerHTML = '<div id="app"></div>';

  const createObjectURL = vi.fn(() => "blob:test");
  const revokeObjectURL = vi.fn();
  Object.defineProperties(URL, {
    createObjectURL: { configurable: true, value: createObjectURL },
    revokeObjectURL: { configurable: true, value: revokeObjectURL },
  });
  const anchorClick = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});

  await import("../../src/main");
  await vi.waitFor(() => expect(document.querySelector("#logList")?.textContent).toContain("Ready"));

  expect(document.documentElement.dataset.theme).toBe("light");
  expect(document.querySelector('[data-view="modules"]')?.getAttribute("aria-current")).toBe("page");
  expect((document.querySelector('[data-view-panel="deck"]') as HTMLElement).hidden).toBe(true);

  const moduleSource = `export default {
    id: "fixture", name: "Fixture <Module>", description: "Fixture settings",
    configFields: [{ key: "host", label: "Host", type: "text", defaultValue: "default" }],
    events: [{ id: "go", name: "Go", description: "Run it", parameterFields:
      [{ key: "value", label: "Value", type: "text", defaultValue: "initial" }],
      buildMessage: ({ params }) => JSON.stringify(params) }],
    createController(host) { let status = "disabled"; return {
      connect() { status = "connected"; host.setStatus(status); host.log("system", "Fixture connected"); },
      disconnect() { status = "disabled"; host.setStatus(status); }, getStatus() { return status; },
      triggerEvent(event, params) { host.log("outgoing", event.buildMessage({ config: host.getConfig(), params })); }
    }; }
  };`;
  const moduleUrl = `data:text/javascript,${encodeURIComponent(moduleSource)}`;
  const moduleInput = document.querySelector<HTMLInputElement>("#customModuleUrlInput")!;
  moduleInput.value = moduleUrl;
  document.querySelector<HTMLFormElement>("#customModuleForm")!
    .dispatchEvent(new SubmitEvent("submit", { bubbles: true, cancelable: true }));
  await vi.waitFor(() => expect(document.querySelector("#moduleGrid")?.textContent).toContain("Fixture <Module>"));
  expect(document.querySelector("#moduleGrid script")).toBeNull();
  expect(JSON.parse(localStorage.getItem("webdeck.customModules")!)).toEqual([moduleUrl]);

  click('.module-card[data-module-id="fixture"]');
  expect(document.querySelector("#moduleGrid")?.textContent).toContain("Fixture settings");
  const hostInput = document.querySelector<HTMLInputElement>('[data-config-key="host"]')!;
  hostInput.value = "changed";
  hostInput.dispatchEvent(new Event("input", { bubbles: true }));
  expect(JSON.parse(localStorage.getItem("webdeck.config.fixture")!)).toEqual({ host: "changed" });
  click('[data-action="back"]');
  click('.module-card[data-module-id="fixture"] input[data-action="toggle"]');
  await vi.waitFor(() => expect(document.querySelector("#statusText")?.textContent).toBe("1 connected"));
  expect(localStorage.getItem("webdeck.enabled.fixture")).toBe("true");

  click('[data-view="deck"]');
  expect(document.querySelectorAll(".deck-button")).toHaveLength(6);
  expect((document.querySelector('[data-view-panel="deck"]') as HTMLElement).hidden).toBe(false);
  click("#deckEditToggle");
  expect((document.querySelector("#deckConfigPanel") as HTMLElement).hidden).toBe(false);
  expect(document.querySelector("#deckConfigPanel")?.textContent).toContain("Button 1");

  const moduleSelect = document.querySelector<HTMLSelectElement>('[data-deck-config="module"]')!;
  moduleSelect.value = "fixture";
  moduleSelect.dispatchEvent(new Event("change", { bubbles: true }));
  const parameter = document.querySelector<HTMLInputElement>('[data-param-key="value"]')!;
  parameter.value = "custom";
  parameter.dispatchEvent(new Event("input", { bubbles: true }));
  expect(JSON.parse(localStorage.getItem("webdeck.deckButtons")!)[0]).toMatchObject({
    moduleId: "fixture", eventId: "go", params: { value: "custom" },
  });

  const label = document.querySelector<HTMLInputElement>('[data-deck-config="label"]')!;
  label.value = "Launch <now>";
  label.dispatchEvent(new Event("input", { bubbles: true }));
  expect(document.querySelector('.deck-button[data-deck-index="0"] span')?.textContent).toBe("Launch <now>");
  expect(document.querySelector(".deck-button script")).toBeNull();
  click("#deckEditToggle");
  click('.deck-button[data-deck-index="0"]');
  await vi.waitFor(() => expect(document.querySelector("#logList")?.textContent).toContain('{"value":"custom"}'));
  click("#deckEditToggle");

  click('[data-action="delete-button"]');
  expect(JSON.parse(localStorage.getItem("webdeck.deckButtons")!)[0]).toBeNull();
  expect(document.querySelector('.deck-button[data-deck-index="0"] span')?.textContent).toBe("1");
  expect(document.querySelector<HTMLInputElement>('[data-deck-config="label"]')?.value).toBe("");
  expect(document.querySelector<HTMLSelectElement>('[data-deck-config="module"]')?.value).toBe("");
  expect(document.querySelector<HTMLButtonElement>('[data-action="delete-button"]')?.disabled).toBe(true);

  const rows = document.querySelector<HTMLInputElement>("#deckRowsInput")!;
  const columns = document.querySelector<HTMLInputElement>("#deckColumnsInput")!;
  rows.value = "1";
  columns.value = "2";
  columns.dispatchEvent(new Event("change", { bubbles: true }));
  expect(document.querySelectorAll(".deck-button")).toHaveLength(2);
  expect(JSON.parse(localStorage.getItem("webdeck.deckLayout")!)).toEqual({ rows: 1, columns: 2 });

  click('[data-view="system"]');
  click("#themeToggle");
  expect(document.documentElement.dataset.theme).toBe("dark");
  expect(localStorage.getItem("webdeck.theme")).toBe("dark");

  click("#exportConfigButton");
  expect(createObjectURL).toHaveBeenCalledOnce();
  expect(anchorClick).toHaveBeenCalledOnce();
  expect((createObjectURL.mock.calls[0][0] as Blob).type).toBe("application/json");

  const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
    new Response("nope", { status: 503 }),
  );
  const urlInput = document.querySelector<HTMLInputElement>("#importConfigUrlInput")!;
  urlInput.value = "https://example.test/config.json";
  document.querySelector<HTMLFormElement>("#importConfigUrlForm")!
    .dispatchEvent(new SubmitEvent("submit", { bubbles: true, cancelable: true }));
  await vi.waitFor(() => expect(document.querySelector("#logList")?.textContent).toContain("HTTP 503"));
  expect(fetchMock).toHaveBeenCalledWith("https://example.test/config.json", {
    headers: { Accept: "application/json" },
  });
  expect(document.querySelector<HTMLButtonElement>("#importConfigUrlButton")!.disabled).toBe(false);

  const deckPanel = document.querySelector<HTMLElement>("#deckPanel")!;
  Object.defineProperty(deckPanel, "requestFullscreen", {
    configurable: true,
    value: vi.fn().mockRejectedValue(new Error("denied")),
  });
  click('[data-view="deck"]');
  click("#deckFullscreenButton");
  await vi.waitFor(() => expect(document.querySelector("#logList")?.textContent).toContain("denied"));

  click('[data-view="system"]');
  click("#clearButton");
  expect(document.querySelector("#logCount")?.textContent).toBe("1 event");
  expect(document.querySelector("#logList")?.textContent).toContain("Log cleared");
});
