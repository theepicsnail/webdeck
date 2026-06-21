import type {
  WebDeckConnectionStatus,
  WebDeckModule,
  WebDeckModuleController,
  WebDeckModuleControllerHost,
} from "./types";

const API_NAME = "VTubeStudioPublicAPI";
const API_VERSION = "1.0";
const PLUGIN_NAME = "WebDeck";
const PLUGIN_DEVELOPER = "WebDeck";
const AUTH_TOKEN_CONFIG_KEY = "authenticationToken";

type VTubeStudioMessage = {
  requestID?: string;
  messageType?: string;
  data?: {
    authenticated?: boolean;
    authenticationToken?: string;
    errorID?: number;
    message?: string;
  };
};

export const vtubeStudioModule: WebDeckModule = {
  id: "vtube-studio",
  name: "VTube Studio",
  description: "Connect to VTube Studio's public API WebSocket.",
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
      defaultValue: "8001",
      placeholder: "8001",
      required: true,
    },
  ],
  events: [
    {
      id: "enable-animation",
      name: "Enable Animation",
      description: "Trigger a VTube Studio animation by name.",
      parameterFields: [
        {
          key: "animationName",
          label: "Animation Name",
          type: "text",
          defaultValue: "",
          placeholder: "Wave",
          required: true,
        },
      ],
      buildMessage: ({ params }) =>
        JSON.stringify({
          apiName: "VTubeStudioPublicAPI",
          apiVersion: "1.0",
          requestID: crypto.randomUUID(),
          messageType: "HotkeyTriggerRequest",
          data: {
            hotkeyID: params.animationName,
          },
        }),
    },
  ],
  createController: (host) => createVTubeStudioController(host),
};

function createVTubeStudioController(
  host: WebDeckModuleControllerHost,
): WebDeckModuleController {
  let socket: WebSocket | null = null;
  let status: WebDeckConnectionStatus = "disabled";
  let isAuthenticated = false;
  let authenticationToken = "";
  const responseHandlers = new Map<string, (message: VTubeStudioMessage) => void>();

  const setStatus = (nextStatus: WebDeckConnectionStatus) => {
    status = nextStatus;
    host.setStatus(nextStatus);
  };

  const send = (message: string): boolean => {
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      host.log("error", "VTube Studio requires an open WebSocket connection.");
      return false;
    }

    socket.send(message);
    host.log("outgoing", message);
    return true;
  };

  const sendRequest = (
    messageType: string,
    data: Record<string, string>,
    onResponse: (message: VTubeStudioMessage) => void,
  ) => {
    const requestID = crypto.randomUUID();
    responseHandlers.set(requestID, onResponse);

    const didSend = send(
      JSON.stringify({
        apiName: API_NAME,
        apiVersion: API_VERSION,
        requestID,
        messageType,
        data,
      }),
    );

    if (!didSend) {
      responseHandlers.delete(requestID);
    }
  };

  const requestAuthenticationToken = () => {
    host.log("system", "Requesting VTube Studio authentication token.");
    sendRequest(
      "AuthenticationTokenRequest",
      {
        pluginName: PLUGIN_NAME,
        pluginDeveloper: PLUGIN_DEVELOPER,
      },
      (message) => {
        const error = message.data?.errorID;

        if (error) {
          host.log("error", message.data?.message ?? `VTube Studio token request failed (${error}).`);
          socket?.close(1000, "Authentication token request failed");
          return;
        }

        const token = message.data?.authenticationToken;

        if (!token) {
          host.log("error", "VTube Studio did not return an authentication token.");
          socket?.close(1000, "Missing authentication token");
          return;
        }

        authenticationToken = token;
        host.setConfigValue?.(AUTH_TOKEN_CONFIG_KEY, token);
        requestAuthentication(false);
      },
    );
  };

  const requestAuthentication = (shouldRetryWithNewToken: boolean) => {
    const token = authenticationToken || host.getConfig()[AUTH_TOKEN_CONFIG_KEY];

    if (!token) {
      requestAuthenticationToken();
      return;
    }

    sendRequest(
      "AuthenticationRequest",
      {
        pluginName: PLUGIN_NAME,
        pluginDeveloper: PLUGIN_DEVELOPER,
        authenticationToken: token,
      },
      (message) => {
        if (message.data?.authenticated) {
          isAuthenticated = true;
          setStatus("connected");
          host.log("system", "Authenticated.");
          return;
        }

        if (shouldRetryWithNewToken) {
          requestAuthenticationToken();
          return;
        }

        host.log("error", message.data?.message ?? "VTube Studio authentication was rejected.");
        socket?.close(1000, "Authentication rejected");
      },
    );
  };

  return {
    connect() {
      const config = host.getConfig();
      const url = `ws://${config.host}:${config.port}`;

      isAuthenticated = false;
      authenticationToken = config[AUTH_TOKEN_CONFIG_KEY] ?? "";
      responseHandlers.clear();
      socket?.close(1000, "Replacing connection");
      setStatus("connecting");
      host.log("system", `Connecting to ${url}`);

      socket = new WebSocket(url);
      const activeSocket = socket;

      activeSocket.addEventListener("open", () => {
        host.log("system", "Connected. Authenticating with VTube Studio.");
        requestAuthentication(true);
      });

      activeSocket.addEventListener("message", (event: MessageEvent) => {
        if (socket !== activeSocket) {
          return;
        }

        host.log("incoming", typeof event.data === "string" ? event.data : String(event.data));
        const message = parseVTubeStudioMessage(event.data);

        if (!message?.requestID) {
          return;
        }

        const handler = responseHandlers.get(message.requestID);

        if (!handler) {
          return;
        }

        responseHandlers.delete(message.requestID);
        handler(message);
      });

      activeSocket.addEventListener("error", () => {
        if (socket !== activeSocket) {
          return;
        }

        setStatus("error");
        host.log("error", "WebSocket error. Check VTube Studio API access.");
      });

      activeSocket.addEventListener("close", (event: CloseEvent) => {
        if (socket !== activeSocket) {
          return;
        }

        const reason = event.reason ? `: ${event.reason}` : "";
        socket = null;
        isAuthenticated = false;
        responseHandlers.clear();
        setStatus(status === "disabled" ? "disabled" : "error");
        host.log("system", `Closed (${event.code})${reason}`);
      });
    },
    disconnect() {
      setStatus("disabled");
      isAuthenticated = false;
      responseHandlers.clear();
      socket?.close(1000, "Module disabled");
      socket = null;
      host.log("system", "Disabled.");
    },
    dispose() {
      isAuthenticated = false;
      responseHandlers.clear();
      socket?.close(1000, "Module disposed");
      socket = null;
    },
    getStatus() {
      return status;
    },
    triggerEvent(event, params) {
      if (!socket || socket.readyState !== WebSocket.OPEN || !isAuthenticated) {
        host.log("error", `${event.name} requires an authenticated VTube Studio connection.`);
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

function parseVTubeStudioMessage(message: unknown): VTubeStudioMessage | null {
  if (typeof message !== "string") {
    return null;
  }

  try {
    const parsed = JSON.parse(message) as unknown;

    if (parsed && typeof parsed === "object") {
      return parsed as VTubeStudioMessage;
    }
  } catch {
    return null;
  }

  return null;
}

export default vtubeStudioModule;
