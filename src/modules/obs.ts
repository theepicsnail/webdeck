import type {
  WebDeckConnectionStatus,
  WebDeckModule,
  WebDeckModuleController,
  WebDeckModuleControllerHost,
} from "./types";

type ObsHelloMessage = {
  op: number;
  d?: {
    rpcVersion?: number;
    authentication?: {
      challenge: string;
      salt: string;
    };
  };
};

export const obsModule: WebDeckModule = {
  id: "obs",
  name: "OBS",
  description: "Connect to the OBS WebSocket server.",
  configFields: [
    {
      key: "host",
      label: "Host",
      type: "text",
      defaultValue: "localhost",
      placeholder: "localhost",
      required: true,
    },
    {
      key: "port",
      label: "Port",
      type: "number",
      defaultValue: "4455",
      placeholder: "4455",
      required: true,
    },
    {
      key: "password",
      label: "Password",
      type: "password",
      defaultValue: "",
      placeholder: "OBS WebSocket password",
    },
  ],
  events: [
    // https://github.com/obsproject/obs-websocket/blob/master/docs/generated/protocol.md#requests-table-of-contents
    {
      id: "scene-change",
      name: "Scene Change",
      description: "Switch the active OBS program scene.",
      parameterFields: [
        {
          key: "sceneName",
          label: "Scene Name",
          type: "text",
          defaultValue: "",
          placeholder: "Starting Soon",
          required: true,
        },
      ],
      buildMessage: ({ params }) =>
        JSON.stringify({
          op: 6,
          d: {
            requestType: "SetCurrentProgramScene",
            requestId: crypto.randomUUID(),
            requestData: {
              sceneName: params.sceneName,
            },
          },
        }),
    },
  ],
  createController: (host) => createObsController(host),
};

function createObsController(
  host: WebDeckModuleControllerHost,
): WebDeckModuleController {
  let socket: WebSocket | null = null;
  let status: WebDeckConnectionStatus = "disabled";

  const setStatus = (nextStatus: WebDeckConnectionStatus) => {
    status = nextStatus;
    host.setStatus(nextStatus);
  };

  const send = (message: string) => {
    socket?.send(message);
    host.log("outgoing", message);
  };

  return {
    async connect() {
      const config = host.getConfig();
      const url = `ws://${config.host}:${config.port}`;

      socket?.close(1000, "Replacing connection");
      setStatus("connecting");
      host.log("system", `Connecting to ${url}`);

      socket = new WebSocket(url);

      socket.addEventListener("open", () => {
        setStatus("connected");
        host.log("system", "Connected.");
      });

      socket.addEventListener("message", (event: MessageEvent) => {
        host.log("incoming", stringifyMessage(event.data));
        void handleObsMessage(event.data, config, send, host);
      });

      socket.addEventListener("error", () => {
        setStatus("error");
        host.log("error", "WebSocket error. Check OBS and browser access.");
      });

      socket.addEventListener("close", (event: CloseEvent) => {
        const reason = event.reason ? `: ${event.reason}` : "";
        socket = null;
        setStatus(status === "disabled" ? "disabled" : "error");
        host.log("system", `Closed (${event.code})${reason}`);
      });
    },
    disconnect() {
      setStatus("disabled");
      socket?.close(1000, "Module disabled");
      socket = null;
      host.log("system", "Disabled.");
    },
    dispose() {
      socket?.close(1000, "Module disposed");
      socket = null;
    },
    getStatus() {
      return status;
    },
    triggerEvent(event, params) {
      if (!socket || socket.readyState !== WebSocket.OPEN) {
        host.log("error", `${event.name} requires an active OBS connection.`);
        return;
      }

      if (!event.buildMessage) {
        host.log("error", `${event.name} has no message builder.`);
        return;
      }

      send(event.buildMessage({ config: host.getConfig(), params }));
    },
  };
}

async function handleObsMessage(
  message: unknown,
  config: Record<string, string>,
  send: (message: string) => void,
  host: WebDeckModuleControllerHost,
): Promise<void> {
  const parsed = parseObsMessage(message);

  if (!parsed || parsed.op !== 0) {
    return;
  }

  const authentication = parsed.d?.authentication;
  const identify: {
    op: 1;
    d: {
      rpcVersion: number;
      authentication?: string;
    };
  } = {
    op: 1,
    d: {
      rpcVersion: Math.min(parsed.d?.rpcVersion ?? 1, 1),
    },
  };

  if (authentication && config.password) {
    identify.d.authentication = await createObsAuthentication(
      config.password,
      authentication.salt,
      authentication.challenge,
    );
  }

  if (authentication && !config.password) {
    host.log("error", "OBS requires a password, but none is configured.");
  }

  send(JSON.stringify(identify));
}

function stringifyMessage(data: unknown): string {
  return typeof data === "string" ? data : String(data);
}

function parseObsMessage(message: unknown): ObsHelloMessage | null {
  if (typeof message !== "string") {
    return null;
  }

  try {
    const parsed = JSON.parse(message) as unknown;

    if (parsed && typeof parsed === "object" && "op" in parsed) {
      return parsed as ObsHelloMessage;
    }
  } catch {
    return null;
  }

  return null;
}

async function createObsAuthentication(
  password: string,
  salt: string,
  challenge: string,
): Promise<string> {
  const secret = await sha256Base64(`${password}${salt}`);

  return sha256Base64(`${secret}${challenge}`);
}

async function sha256Base64(value: string): Promise<string> {
  const encoded = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", encoded);

  return bytesToBase64(new Uint8Array(digest));
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";

  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary);
}

export default obsModule;
