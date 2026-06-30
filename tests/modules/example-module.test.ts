import { beforeEach, describe, expect, it } from "vitest";
// The public fixture is intentionally plain browser JavaScript.
// @ts-expect-error no TypeScript declarations are needed for the fixture
import exampleModule from "../../public/example-module.js";
import { createControllerHost } from "../helpers/controller-host";
import { FakeWebSocket } from "../helpers/fake-websocket";

describe("example third-party module", () => {
  beforeEach(() => FakeWebSocket.install());

  it("implements the documented controller lifecycle and has no deck events", () => {
    const context = createControllerHost({ host: "echo.local", port: "8787" });
    const controller = exampleModule.createController(context.host);
    expect(exampleModule.events).toBeUndefined();
    controller.connect();
    const socket = FakeWebSocket.latest();
    expect(socket.url).toBe("ws://echo.local:8787");
    socket.open();
    expect(controller.getStatus()).toBe("connected");
    socket.message("echo");
    expect(context.logs.at(-1)).toEqual({ direction: "incoming", message: "echo" });
    controller.disconnect();
    expect(controller.getStatus()).toBe("disabled");
  });

  it("reports socket errors and unexpected closes", () => {
    const context = createControllerHost({ host: "localhost", port: "8787" });
    const controller = exampleModule.createController(context.host);
    controller.connect();
    const socket = FakeWebSocket.latest();
    socket.error();
    expect(controller.getStatus()).toBe("error");
    socket.closed();
    expect(controller.getStatus()).toBe("error");
  });
});
