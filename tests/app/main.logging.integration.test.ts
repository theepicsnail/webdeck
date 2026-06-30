import { expect, it, vi } from "vitest";

it("captures console output, caps logs at 300, escapes messages, and clears the list", async () => {
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  document.body.innerHTML = '<div id="app"></div>';
  await import("../../src/main");
  await vi.waitFor(() => expect(document.querySelector("#logList")?.textContent).toContain("Ready"));

  for (let index = 0; index < 301; index += 1) {
    console.log(`entry-${index}`, { index });
  }
  expect(document.querySelector("#logCount")?.textContent).toBe("300 events");
  expect(document.querySelector("#logList")?.firstElementChild?.textContent).toContain("entry-300");
  expect(document.querySelector("#logList")?.textContent).not.toContain("entry-0 ");

  console.warn("warning", 2n);
  console.error("<script>bad()</script>");
  const first = document.querySelector<HTMLElement>("#logList")!.firstElementChild as HTMLElement;
  expect(first.dataset.direction).toBe("error");
  expect(first.textContent).toContain("<script>bad()</script>");
  expect(first.querySelector("script")).toBeNull();

  document.querySelector<HTMLButtonElement>("#clearButton")!.click();
  expect(document.querySelector("#logCount")?.textContent).toBe("1 event");
  document.querySelector<HTMLButtonElement>("#clearButton")!.click();
  expect(document.querySelector("#logCount")?.textContent).toBe("1 event");
}, 15_000);
