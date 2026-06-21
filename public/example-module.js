export default {
  id: "echo-example",
  name: "Echo Example",
  description: "Example third-party module that connects to a local echo server.",
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
      defaultValue: "8787",
      placeholder: "8787",
      required: true,
    },
  ],
  createController: (host) => {
    let socket = null;
    let status = "disabled";

    const setStatus = (nextStatus) => {
      status = nextStatus;
      host.setStatus(nextStatus);
    };

    return {
      connect() {
        const config = host.getConfig();
        const url = `ws://${config.host}:${config.port}`;

        setStatus("connecting");
        host.log("system", `Connecting to ${url}`);
        socket = new WebSocket(url);
        socket.addEventListener("open", () => {
          setStatus("connected");
          host.log("system", "Connected.");
        });
        socket.addEventListener("message", (event) => {
          host.log("incoming", String(event.data));
        });
        socket.addEventListener("error", () => {
          setStatus("error");
          host.log("error", "WebSocket error.");
        });
        socket.addEventListener("close", () => {
          socket = null;
          setStatus(status === "disabled" ? "disabled" : "error");
        });
      },
      disconnect() {
        setStatus("disabled");
        socket?.close(1000, "Module disabled");
        socket = null;
      },
      getStatus() {
        return status;
      },
    };
  },
};
