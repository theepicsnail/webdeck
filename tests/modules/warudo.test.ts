import { beforeEach, describe, expect, it } from "vitest";
import { warudoModule } from "../../src/modules/warudo";
import { createControllerHost } from "../helpers/controller-host";
import { FakeWebSocket } from "../helpers/fake-websocket";

describe("Warudo module", () => {
  beforeEach(() => FakeWebSocket.install());

  it("connects, logs incoming data, and sends parsed action data", async () => {
    const context = createControllerHost({ host: "warudo.local", port: "19190" });
    const controller = warudoModule.createController!(context.host);
    await controller.connect!();
    const socket = FakeWebSocket.latest();
    expect(socket.url).toBe("ws://warudo.local:19190");
    socket.open();
    socket.message("hello");
    controller.triggerEvent!(warudoModule.events![0], { action: "Pixelate", data: '{"level":2}' });
    expect(JSON.parse(socket.sent[0])).toEqual({ action: "Pixelate", data: { level: 2 } });
    expect(context.logs.some((entry) => entry.direction === "incoming" && entry.message === "hello"))
      .toBe(true);
  });

  it.each([
    ["true", true], ["12", 12], ['"text"', "text"], ["null", null], ["[1]", [1]],
  ])("supports JSON scalar/collection data %s", async (data, expected) => {
    const context = createControllerHost({ host: "localhost", port: "1" });
    const controller = warudoModule.createController!(context.host);
    await controller.connect!();
    const socket = FakeWebSocket.latest();
    socket.open();
    controller.triggerEvent!(warudoModule.events![0], { action: "A", data });
    expect(JSON.parse(socket.sent[0]).data).toEqual(expected);
  });

  it("exposes invalid JSON and handles connection failures", async () => {
    const context = createControllerHost({ host: "localhost", port: "19190" });
    const controller = warudoModule.createController!(context.host);
    await controller.connect!();
    const socket = FakeWebSocket.latest();
    socket.open();
    expect(() => controller.triggerEvent!(warudoModule.events![0], { action: "A", data: "bad" }))
      .toThrow();
    socket.closed(1006);
    controller.triggerEvent!(warudoModule.events![0], { action: "A", data: "null" });
    expect(context.logs.at(-1)?.message).toContain("requires an active Warudo connection");
    socket.error();
    expect(controller.getStatus()).toBe("error");
    socket.closed(1006);
    expect(context.logs.at(-1)?.message).toBe("Closed (1006)");
  });

  it("disables and detects a missing message builder", async () => {
    const context = createControllerHost({ host: "localhost", port: "19190" });
    const controller = warudoModule.createController!(context.host);
    await controller.connect!();
    const socket = FakeWebSocket.latest();
    socket.open();
    controller.triggerEvent!({ ...warudoModule.events![0], buildMessage: undefined }, {});
    expect(context.logs.at(-1)?.message).toContain("no message builder");
    await controller.disconnect!();
    expect(controller.getStatus()).toBe("disabled");
    expect(socket.closeCalls.at(-1)).toEqual({ code: 1000, reason: "Module disabled" });
    await controller.dispose!();
  });
});
