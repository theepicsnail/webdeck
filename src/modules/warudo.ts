import type {
  WebDeckConnectionStatus,
  WebDeckModule,
  WebDeckModuleController,
  WebDeckModuleControllerHost,
} from "./types";

export const warudoModule: WebDeckModule = {
  id: "warudo",
  name: "Warudo",
  description: "Connect to a local Warudo WebSocket endpoint.",
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
      defaultValue: "19190",
      placeholder: "19190",
      required: true,
    },
  ],
  events: [
    {
      id: "send-action",
      name: "Send Action",
      description: "Send a Warudo action with a data value.",
      parameterFields: [
        {
          key: "action",
          label: "Action",
          type: "text",
          defaultValue: "Pixelate",
          placeholder: "Pixelate",
          required: true,
        },
        {
          key: "data",
          label: "Data",
          type: "text",
          defaultValue: "json value",
          required: false,
        },
      ],
      buildMessage: ({ params }) =>
        JSON.stringify({
          action: params.action,
          data: JSON.parse(params.data),
        }),
    },
  ],
  createController: (host) => createWarudoController(host),
};

function createWarudoController(
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
    connect() {
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
        host.log("incoming", typeof event.data === "string" ? event.data : String(event.data));
      });

      socket.addEventListener("error", () => {
        setStatus("error");
        host.log("error", "WebSocket error. Check Warudo WebSocket access.");
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
        host.log("error", `${event.name} requires an active Warudo connection.`);
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

export default warudoModule;
