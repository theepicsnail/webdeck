import { beforeEach, describe, expect, it, vi } from "vitest";
import { obsModule } from "../../src/modules/obs";
import { createControllerHost } from "../helpers/controller-host";
import { FakeWebSocket } from "../helpers/fake-websocket";

describe("OBS module", () => {
  beforeEach(() => {
    FakeWebSocket.install();
    vi.spyOn(Math, "random").mockReturnValue(0.123456789);
  });

  it("connects, handshakes without auth, and sends scene changes", async () => {
    const context = createControllerHost({ host: "obs.local", port: "4455", password: "" });
    const controller = obsModule.createController!(context.host);
    await controller.connect!();
    const socket = FakeWebSocket.latest();
    expect(socket.url).toBe("ws://obs.local:4455");
    expect(controller.getStatus()).toBe("connecting");

    socket.open();
    expect(controller.getStatus()).toBe("connected");
    socket.message(JSON.stringify({ op: 0, d: { rpcVersion: 3 } }));
    await vi.waitFor(() => expect(socket.sent).toHaveLength(1));
    expect(JSON.parse(socket.sent[0])).toEqual({ op: 1, d: { rpcVersion: 1 } });

    controller.triggerEvent!(obsModule.events![0], { sceneName: "Main" });
    expect(JSON.parse(socket.sent[1])).toMatchObject({
      op: 6,
      d: { requestType: "SetCurrentProgramScene", requestData: { sceneName: "Main" } },
    });
    expect(JSON.parse(socket.sent[1]).d.requestId).not.toBe("");
  });

  it("creates authentication and reports a missing password", async () => {
    const authed = createControllerHost({ host: "localhost", port: "4455", password: "secret" });
    const controller = obsModule.createController!(authed.host);
    await controller.connect!();
    const socket = FakeWebSocket.latest();
    socket.open();
    socket.message(JSON.stringify({
      op: 0,
      d: { rpcVersion: 1, authentication: { salt: "salt", challenge: "challenge" } },
    }));
    await vi.waitFor(() => expect(socket.sent).toHaveLength(1));
    expect(JSON.parse(socket.sent[0]).d.authentication).toMatch(/^[A-Za-z0-9+/]+=*$/);

    const missing = createControllerHost({ host: "localhost", port: "4455", password: "" });
    const missingController = obsModule.createController!(missing.host);
    await missingController.connect!();
    const missingSocket = FakeWebSocket.latest();
    missingSocket.open();
    missingSocket.message(JSON.stringify({
      op: 0, d: { authentication: { salt: "s", challenge: "c" } },
    }));
    await vi.waitFor(() => expect(missingSocket.sent).toHaveLength(1));
    expect(missing.logs.some((entry) => entry.message.includes("requires a password"))).toBe(true);
    expect(JSON.parse(missingSocket.sent[0]).d.authentication).toBeUndefined();
  });

  it("ignores malformed handshake data and handles errors, close, disable, and dispose", async () => {
    const context = createControllerHost({ host: "localhost", port: "4455", password: "" });
    const controller = obsModule.createController!(context.host);
    await controller.connect!();
    const socket = FakeWebSocket.latest();
    socket.open();
    socket.message("not json");
    socket.message(JSON.stringify({ op: 2 }));
    socket.message(new Uint8Array([1]));
    expect(socket.sent).toHaveLength(0);
    socket.error();
    expect(controller.getStatus()).toBe("error");
    socket.closed(4000, "gone");
    expect(context.logs.at(-1)?.message).toBe("Closed (4000): gone");

    controller.triggerEvent!(obsModule.events![0], { sceneName: "Nope" });
    expect(context.logs.at(-1)?.message).toContain("requires an active OBS connection");
    controller.triggerEvent!({ ...obsModule.events![0], buildMessage: undefined }, {});
    expect(context.logs.at(-1)?.message).toContain("requires an active OBS connection");

    await controller.connect!();
    const next = FakeWebSocket.latest();
    next.open();
    controller.triggerEvent!({ ...obsModule.events![0], buildMessage: undefined }, {});
    expect(context.logs.at(-1)?.message).toContain("no message builder");
    await controller.disconnect!();
    expect(controller.getStatus()).toBe("disabled");
    expect(next.closeCalls.at(-1)).toEqual({ code: 1000, reason: "Module disabled" });
    await controller.dispose!();
  });
});
