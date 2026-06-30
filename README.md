# WebDeck

A static TypeScript WebSocket client for connecting to localhost apps from the
browser through bundled or third-party modules.

Bundled modules:

- OBS
- VTube Studio
- Warudo

The bundled modules are compiled as separate browser ESM files:

- `obs.js`
- `vtube-studio.js`
- `warudo.js`

The main app loads those files at runtime through the same module loader used
for third-party module URLs.

## Local Development

```powershell
npm.cmd install
npm.cmd run dev
```

Open the URL Vite prints. The app has three in-page views:

- **Modules**: load module URLs, enable modules, and edit module settings.
- **Deck**: an 8 x 8 grid of square buttons with an edit mode for assigning
  module events.
- **Log**: connection events and captured `console.log`, `console.warn`, and
  `console.error` output.

Each enabled module keeps its own WebSocket connection, config, and status.

Each module has an in-app settings page. Opening settings does not refresh the
browser page, so active WebSocket connections remain alive. Connection setting
changes are saved immediately and apply when that module reconnects.

The bundled defaults are:

```text
OBS: ws://localhost:4455
VTube Studio: ws://localhost:8001
Warudo: ws://localhost:19190
```

## Build

```powershell
npm.cmd run build
```

The static site is emitted to `dist/`.

## Testing

```powershell
npm.cmd test
npm.cmd run test:watch
npm.cmd run test:coverage
```

The suite uses Vitest and jsdom for unit and browser-facing integration tests.
Connector tests use deterministic fake WebSockets, so OBS, VTube Studio, and
Warudo do not need to be running. See `TESTING.md` for the complete feature
inventory, expected edge cases, and the remaining real-browser smoke checks.

## Module API

Bundled modules and third-party modules use the same browser-side interface.
Third-party modules must be ESM files that export the module object as `default`
or as `webDeckModule`.

```js
export default {
  id: "my-module",
  name: "My Module",
  description: "Connects to my local app.",
  configFields: [
    {
      key: "host",
      label: "Host",
      type: "text",
      defaultValue: "localhost",
      required: true,
    },
    {
      key: "port",
      label: "Port",
      type: "number",
      defaultValue: "8787",
      required: true,
    },
  ],
  events: [
    {
      id: "example-event",
      name: "Example Event",
      parameterFields: [
        {
          key: "name",
          label: "Name",
          type: "text",
          defaultValue: "",
        },
      ],
      buildMessage: ({ params }) => JSON.stringify({ name: params.name }),
    },
  ],
  createController: (host) => {
    let status = "disabled";

    return {
      connect() {
        status = "connected";
        host.setStatus(status);
        host.log("system", "Example module enabled.");
      },
      disconnect() {
        status = "disabled";
        host.setStatus(status);
      },
      getStatus() {
        return status;
      },
      triggerEvent(event, params) {
        host.log("outgoing", `${event.name}: ${JSON.stringify(params)}`);
      },
    };
  },
};
```

The full TypeScript contract lives in `src/modules/types.ts`.

Modules own their own connection lifecycle. A module may create a WebSocket,
use another transport, or have no network connection at all; it reports status
to the UI through its controller.

Built-in event examples include OBS `Scene Change` with a scene-name parameter
and VTube Studio `Enable Animation` with an animation-name parameter.

When loading a third-party URL in the app, the URL must serve browser-compatible
ESM and allow cross-origin module loading if it is hosted on another domain.
For local testing, the included example can be loaded from:

```text
/example-module.js
```

## GitHub Pages

This project uses a relative Vite base path, so it can be deployed under a
GitHub Pages project URL such as `https://USER.github.io/REPO/`.

After pushing to GitHub:

1. Go to the repository settings.
2. Open **Pages**.
3. Set the source to **GitHub Actions**.
4. Push to `main`.

The included workflow builds and deploys `dist/`.
