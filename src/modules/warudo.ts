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
    {
      key: "path",
      label: "Path",
      type: "text",
      defaultValue: "",
      placeholder: "/",
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

  return {
    connect() {
      const config = host.getConfig();
      const path = config.path ? `/${config.path.replace(/^\/+/, "")}` : "";
      const url = `ws://${config.host}:${config.port}${path}`;

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
  };
}

export default warudoModule;
