import { beforeEach, describe, expect, it, vi } from "vitest";
import { vtubeStudioModule } from "../../src/modules/vtube-studio";
import { createControllerHost } from "../helpers/controller-host";
import { FakeWebSocket } from "../helpers/fake-websocket";

const sentMessage = (socket: FakeWebSocket, index: number) => JSON.parse(socket.sent[index]);

describe("VTube Studio module", () => {
  beforeEach(() => {
    FakeWebSocket.install();
    vi.spyOn(Math, "random")
      .mockReturnValueOnce(0.11)
      .mockReturnValueOnce(0.22)
      .mockReturnValueOnce(0.33)
      .mockReturnValue(0.44);
  });

  it("authenticates with a saved token and triggers a hotkey", async () => {
    const context = createControllerHost({
      host: "vts.local", port: "8001", authenticationToken: "saved-token",
    });
    const controller = vtubeStudioModule.createController!(context.host);
    await controller.connect!();
    const socket = FakeWebSocket.latest();
    expect(socket.url).toBe("ws://vts.local:8001");
    socket.open();

    const auth = sentMessage(socket, 0);
    expect(auth).toMatchObject({
      apiName: "VTubeStudioPublicAPI",
      apiVersion: "1.0",
      messageType: "AuthenticationRequest",
      data: { authenticationToken: "saved-token", pluginName: "WebDeck" },
    });
    socket.message(JSON.stringify({ requestID: "unknown", data: { authenticated: true } }));
    expect(controller.getStatus()).toBe("connecting");
    socket.message(JSON.stringify({ requestID: auth.requestID, data: { authenticated: true } }));
    expect(controller.getStatus()).toBe("connected");
    expect(context.config.authenticationToken).toBe("saved-token");

    controller.triggerEvent!(vtubeStudioModule.events![0], { animationName: "Wave" });
    expect(sentMessage(socket, 1)).toMatchObject({
      messageType: "HotkeyTriggerRequest",
      data: { hotkeyID: "Wave" },
    });
  });

  it("requests and persists a new token when no token exists", async () => {
    const context = createControllerHost({ host: "localhost", port: "8001" });
    const controller = vtubeStudioModule.createController!(context.host);
    await controller.connect!();
    const socket = FakeWebSocket.latest();
    socket.open();
    const tokenRequest = sentMessage(socket, 0);
    expect(tokenRequest.messageType).toBe("AuthenticationTokenRequest");

    socket.message(JSON.stringify({
      requestID: tokenRequest.requestID,
      data: { authenticationToken: "new-token" },
    }));
    const authRequest = sentMessage(socket, 1);
    expect(authRequest.data.authenticationToken).toBe("new-token");
    socket.message(JSON.stringify({ requestID: authRequest.requestID, data: { authenticated: true } }));
    expect(controller.getStatus()).toBe("connected");
    expect(context.config.authenticationToken).toBe("new-token");
  });

  it("retries a rejected saved token with a newly requested token", async () => {
    const context = createControllerHost({
      host: "localhost", port: "8001", authenticationToken: "expired",
    });
    const controller = vtubeStudioModule.createController!(context.host);
    await controller.connect!();
    const socket = FakeWebSocket.latest();
    socket.open();
    const firstAuth = sentMessage(socket, 0);
    socket.message(JSON.stringify({ requestID: firstAuth.requestID, data: { authenticated: false } }));
    expect(sentMessage(socket, 1).messageType).toBe("AuthenticationTokenRequest");
  });

  it.each([
    [{ errorID: 7, message: "Denied" }, "Denied"],
    [{}, "did not return an authentication token"],
  ])("closes for invalid token responses %#", async (data, expectedLog) => {
    const context = createControllerHost({ host: "localhost", port: "8001" });
    const controller = vtubeStudioModule.createController!(context.host);
    await controller.connect!();
    const socket = FakeWebSocket.latest();
    socket.open();
    const request = sentMessage(socket, 0);
    socket.message(JSON.stringify({ requestID: request.requestID, data }));
    expect(context.logs.some((entry) => entry.message.includes(expectedLog))).toBe(true);
    expect(socket.closeCalls.at(-1)?.code).toBe(1000);
  });

  it("logs final auth rejection and protects against stale socket events", async () => {
    const context = createControllerHost({ host: "localhost", port: "8001" });
    const controller = vtubeStudioModule.createController!(context.host);
    await controller.connect!();
    const first = FakeWebSocket.latest();
    first.open();
    const tokenRequest = sentMessage(first, 0);
    first.message(JSON.stringify({
      requestID: tokenRequest.requestID, data: { authenticationToken: "new" },
    }));
    const authRequest = sentMessage(first, 1);
    first.message(JSON.stringify({
      requestID: authRequest.requestID, data: { authenticated: false, message: "Rejected" },
    }));
    expect(context.logs.some((entry) => entry.message === "Rejected")).toBe(true);

    await controller.connect!();
    expect(controller.getStatus()).toBe("connecting");
    first.error();
    first.closed();
    expect(controller.getStatus()).toBe("connecting");
  });

  it("requires authenticated connection, handles errors, and clears state on disable", async () => {
    const context = createControllerHost({ host: "localhost", port: "8001" });
    const controller = vtubeStudioModule.createController!(context.host);
    controller.triggerEvent!(vtubeStudioModule.events![0], { animationName: "Wave" });
    expect(context.logs.at(-1)?.message).toContain("authenticated VTube Studio connection");
    await controller.connect!();
    const socket = FakeWebSocket.latest();
    socket.error();
    expect(controller.getStatus()).toBe("error");
    await controller.disconnect!();
    expect(controller.getStatus()).toBe("disabled");
    expect(socket.closeCalls.at(-1)).toEqual({ code: 1000, reason: "Module disabled" });
    socket.closed(1000, "Module disabled");
    await controller.dispose!();
  });
});
