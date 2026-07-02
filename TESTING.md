# WebDeck Feature and Test Inventory

This document is the source-of-truth inventory for WebDeck behavior as implemented. It is intended to be converted into automated unit, integration, and browser tests later. Each feature has a stable ID, a happy path, and edge or failure cases.

## Current automation status

As of 2026-06-28, the automated suite contains 63 tests across 11 files. It covers the pure config/layout/image boundaries, application DOM flows, storage restoration, dynamic modules, import/export, themes, logging, fullscreen, the public example module, and OBS/VTube Studio/Warudo controller protocols.

The current coverage baseline is 89.94% statements, 79.37% branches, 96.70% functions, and 89.70% lines. Run it with `npm run test:coverage`; the HTML report is written to the ignored `coverage/` directory.

The scenarios under BUILD-002 and cross-cutting X-001 through X-003 still require CI or true-browser smoke checks for layout, assistive technology, browser security policy, and the deployed GitHub Pages environment. Browser-specific fullscreen/download behavior should also retain a real-browser smoke check even though its application logic is covered under jsdom.

## Test levels and shared setup

- **Unit:** pure normalization, validation, message-building, layout, formatting, and storage helper behavior.
- **Component/integration:** DOM rendering and events with mocked browser APIs, storage, dynamic imports, fetch, files, images, canvas, downloads, and WebSockets.
- **End-to-end (E2E):** a built site in a real browser with mock WebSocket services and fixture modules/config files.
- **Build/deploy:** TypeScript/Vite output and GitHub Pages workflow checks.

Run browser scenarios at desktop and narrow/mobile viewport widths, in light and dark themes, and from both a root URL and a nested path equivalent to GitHub Pages. Unless a case says otherwise, begin with empty local storage, no active fullscreen element, and all mock services available.

## 1. Application shell and navigation

### APP-001 — Startup and built-in module restoration

**Happy path**

1. Opening the app renders the Modules, Deck, and System tabs and their panels.
2. OBS, Warudo, and VTube Studio are loaded in that order through the runtime module loader.
3. The Modules view is initially active; inactive panels are hidden.
4. A startup log states that each module loaded, followed by the Ready message.
5. Previously enabled modules begin connecting after all built-in and saved custom modules have been restored.

**Edge and failure cases**

- A built-in module import fails: the remaining module URLs are still attempted and the failure is logged.
- A saved custom module fails to restore: startup continues and the failure is logged.
- A module has no controller factory: it receives the fallback disabled controller without crashing.
- A required DOM element is missing: initialization throws a descriptive `Missing required element` error.
- The `#app` root is missing: startup throws `Missing #app root element`.
- Multiple enabled modules restore simultaneously without sharing status, config, or sockets.

### APP-002 — View navigation

**Happy path**

- Clicking Modules, Deck, or System activates exactly that tab, sets `aria-current="page"`, and displays its panel.
- Returning to a view preserves in-memory state, active connections, logs, deck selection, and edit mode.

**Edge cases**

- Re-clicking the active tab is idempotent.
- An element with an unknown `data-view` does not change the active view.
- Keyboard focus remains usable after rerenders.

### APP-003 — Aggregate connection status

**Happy path**

- The header displays the exact count of runtimes in `connected` state.
- Visual state precedence is connected, then connecting, then error, then disabled.
- Controller status callbacks immediately update module and aggregate status UI.

**Edge cases**

- Mixed states follow precedence (for example, one connected and one errored displays connected styling and `1 connected`).
- Connecting and error states still display `0 connected` when none are connected.
- Zero modules and all-disabled modules display disabled styling and `0 connected`.

### APP-004 — HTML and attribute escaping

**Happy path**

- Module names, descriptions, IDs, field metadata, deck labels, image sources, event names, log messages, and imported/custom values are rendered as text/attributes without executing markup.

**Edge cases**

- Values containing `&`, `<`, `>`, single quotes, and double quotes are escaped correctly.
- Script tags, event-handler strings, and quote-breaking strings do not execute or corrupt surrounding markup.

## 2. Theme

### THEME-001 — Toggle and persistence

**Happy path**

- The app defaults to dark theme when no valid preference exists.
- Toggling changes the root `data-theme`, toggle state, and label (`Dark Mode`/`Light Mode`).
- The choice is saved to `webdeck.theme` and restored after reload.

**Edge cases**

- Stored value `light` restores light mode.
- Missing, `dark`, malformed, or any unexpected stored value resolves to dark mode.
- Toggling while modules are connected does not recreate controllers or interrupt sockets.

## 3. Module discovery, validation, and lifecycle

### MOD-001 — Load a third-party module URL

**Happy path**

1. A valid absolute or page-relative URL imports browser-compatible ESM.
2. The loader accepts either a default export or named `webDeckModule` export (default wins if both exist).
3. A new runtime is shown, a Loaded message is logged, the normalized absolute URL is remembered, and the input is cleared.
4. Remembered URLs are unique and restore on the next startup.

**Edge and failure cases**

- Empty input performs no import and produces no log.
- Invalid URL syntax logs `Enter a valid module URL`.
- Network, CORS, parse, or dynamic-import errors are logged without breaking the app.
- A namespace with neither supported export is rejected.
- A candidate is rejected when it is null/non-object or lacks string `id`, `name`, `description`, or array `configFields`.
- Current validation intentionally does not deeply validate config fields, events, or controller shape; fixtures should document resulting runtime failures separately.
- A remembered URL list containing non-strings filters them out; malformed JSON or a non-array becomes an empty list.
- Equivalent URLs with different serialized forms are distinct; an exactly normalized duplicate is stored once.

### MOD-002 — Reload/replace a duplicate module ID

**Happy path**

- Loading a module whose ID already exists replaces its module definition and controller in the existing runtime rather than adding a second card.
- The old controller is disposed, existing config is retained and merged over new defaults, and the new controller's status is used.

**Edge cases**

- Replacement preserves the runtime's enabled flag.
- Newly introduced config defaults are added; existing values win.
- Removed config keys remain in the runtime config.
- Replacement does not automatically call the new controller's `connect`, even if the runtime is enabled; record this current behavior in tests.
- Async `dispose` is invoked without awaiting; rejection or races should not corrupt unrelated runtimes.

### MOD-003 — Module cards and settings

**Happy path**

- Each runtime renders a card showing name, state, and On/Off toggle.
- Clicking a card opens its settings without navigating or reloading.
- Enter or Space on a focused card opens settings.
- Settings show name, description, state label, toggle, and all declared fields with correct type, value, placeholder, and required attribute.
- Back returns to the card grid.

**Edge cases**

- Clicking the toggle/switch does not also open settings.
- Editing an input does not trigger card navigation.
- Unknown module IDs are ignored safely.
- Status labels map to Connecting, Connected, Error, and Disabled.
- A stale settings module ID falls back to the card grid.

### MOD-004 — Config editing and persistence

**Happy path**

- Input changes immediately update only the selected module's runtime config and `webdeck.config.<id>` storage.
- Stored values merge over declared defaults on startup.
- Password fields render as password inputs; text and number fields retain their declared types.
- A module controller can persist internal values through `setConfigValue` (used for the VTube Studio token).

**Edge cases**

- Missing storage uses defaults.
- Malformed JSON, arrays, null, or non-object stored config uses defaults.
- Missing new fields receive defaults.
- Current storage restoration does not filter non-string values; document behavior with malformed values.
- Settings changes do not reconnect an already connected module; values apply to controller reads and the next connection as appropriate.

### MOD-005 — Enable, disable, restore, and dispose

**Happy path**

- Enabling saves `webdeck.enabled.<id>=true`, saves current config, calls `connect`, reads controller status, and rerenders.
- Disabling saves `false`, calls `disconnect`, reads status, and rerenders.
- Only the exact stored string `true` restores enabled state.
- Before page unload, every controller's optional `dispose` is invoked.

**Edge and failure cases**

- Controllers missing optional connect/disconnect/dispose methods remain usable through fallback behavior.
- Async lifecycle methods are supported when toggled directly.
- Restored enabled modules connect without blocking one another and without awaiting completion.
- Rapid on/off changes, repeated enable, and connection replacement close old sockets without state leaking from stale sockets.
- A controller method throwing/rejecting currently propagates from toggle handling; tests should expose this behavior for later hardening.

## 4. Deck layout and button editing

### DECK-001 — Default grid and sizing

**Happy path**

- The default deck is 8 rows by 8 columns (64 positions).
- Edit mode reveals row/column controls and the config panel; leaving edit mode hides them.
- Changing dimensions saves `webdeck.deckLayout`, updates CSS grid rows/columns/aspect ratio, grows button storage if needed, and keeps selection in range.
- Valid dimensions range from 1 through 16.

**Edge cases**

- Fractional values round to the nearest integer.
- Zero and negatives clamp to 1; values over 16 clamp to 16.
- Empty, NaN, or infinite values normalize to 8.
- Shrinking does not delete hidden button configs; growing later can reveal them again.
- Selection beyond a shrunken grid moves to the last valid index.
- A malformed/missing stored layout restores 8x8; a partially valid object normalizes each dimension independently.

### DECK-002 — Button selection and display label

**Happy path**

- In edit mode, clicking a visible button selects it and opens its configuration without triggering the event.
- Outside edit mode, clicking triggers the configured event.
- Label precedence is a non-whitespace custom label, then event name, then one-based button number.
- Only the selected visible button has selected styling.

**Edge cases**

- A whitespace-only custom label falls back but the stored value is retained.
- Covered cells are not rendered as independent buttons.
- Invalid/missing `data-deck-index` is ignored; index `0` represented as string `"0"` remains valid.

### DECK-003 — Label, module, event, and parameter editing

**Happy path**

- Label and parameter text changes save immediately and update button display where relevant.
- Module choices include only modules with at least one event, plus None.
- Selecting a module selects its first event and initializes that event's parameter defaults.
- Selecting another event resets parameters to that event's defaults.
- Parameter fields honor declared type, placeholder, and required metadata.
- The event description appears in the panel; otherwise instructional fallback text appears.
- Deleting a configured button restores the slot to its unconfigured state, clearing its label, image, spans, module, event, and parameters.

**Edge cases**

- Selecting None clears event ID and parameters and disables the event selector.
- Modules with no events do not appear.
- A missing module/event reference remains representable but shows fallback behavior.
- Switching events discards previously entered parameters for the prior event.
- Edits create a default config for a previously empty button.
- Delete is disabled for a button that has no stored configuration.

### DECK-004 — Button spans and collision handling

**Happy path**

- Column and row spans default to 1 and are persisted with the button.
- A span may cover empty cells when it stays inside grid bounds.
- Covered cells are suppressed; later configured buttons remain visible and are never replaced.
- The renderer reduces an invalid/stale requested span to the largest fitting non-colliding rectangle, down to 1x1.

**Edge and failure cases**

- A requested span crossing the right or bottom boundary is rejected, logged, and reverted in the UI.
- A requested span covering another configured button is rejected, logged, and not saved.
- Non-finite values normalize to 1; fractional values round; values clamp to the current dimension.
- Collision checks distinguish configured buttons from empty positions.
- Stale overlaps created by imports, layout shrinkage, or hidden configs render deterministically without duplicate cells.
- Competing earlier spans use occupied-cell tracking so later spans cannot visually overlap them.

### DECK-005 — Local button image

**Happy path**

- Selecting an image decodes it, scales it proportionally so its longest side is at most 512 px, encodes WebP at quality 0.86, stores a data URL, removes any remote URL, and rerenders.
- Images at or below 512 px are not enlarged.
- Object URLs are revoked after both load and decode failure.
- Remove clears both local and remote image values.

**Edge and failure cases**

- Non-image MIME types are rejected with a log entry.
- Empty file selection is ignored.
- Undecodable files log a descriptive error.
- Missing 2D canvas support logs an error.
- Zero/invalid intrinsic dimensions still result in a minimum 1x1 canvas where browser decoding permits.
- Large images preserve aspect ratio and round output dimensions.
- Storage quota failures from large data URLs are currently uncaught; tests should expose this constraint.

### DECK-006 — Remote button image

**Happy path**

- Typing a trimmed image URL saves it and removes any local data URL when non-empty.
- A configured image is displayed with empty alt text and image styling.
- Local data URL takes precedence if both values exist in imported/malformed data.

**Edge cases**

- Clearing the URL leaves the `imageUrl` as an empty string but no image is rendered.
- Invalid, unavailable, mixed-content, or CORS-restricted image URLs do not break the deck; native broken-image behavior applies.
- Removing an image clears both possible sources.

### DECK-007 — Trigger and test an event

**Happy path**

- Clicking a configured button outside edit mode calls the owning runtime controller's `triggerEvent` with the resolved event definition and stored params.
- Test Event does the same while editing.

**Edge and failure cases**

- An unconfigured button logs `Button N is not configured`.
- A missing module or event logs an error.
- A controller without `triggerEvent` logs that the event is unsupported.
- Connector-specific disconnected/authentication failures are logged by that connector.
- A message builder that throws (for example invalid Warudo JSON data) currently escapes the trigger path; capture this current behavior.

### DECK-008 — Fullscreen

**Happy path**

- Fullscreen requests target the deck panel only.
- The control exits fullscreen when any fullscreen element exists.
- `fullscreenchange` synchronizes panel/body state, button text, and `aria-pressed`.

**Edge and failure cases**

- Request or exit rejection is logged without breaking the deck.
- Browser/user-gesture restrictions and unsupported fullscreen APIs are handled through the error path.
- External fullscreen exit updates the UI.
- Fullscreen state is not persisted after reload.

## 5. Configuration import and export

### CFG-001 — Export

**Happy path**

- Export produces pretty-printed JSON containing schema version 1, ISO export timestamp, every loaded runtime's ID/enabled/config, remembered custom module URLs, deck layout, and full deck-button array.
- Download MIME type is JSON and filename is `webdeck-config-YYYY-MM-DD.json`.
- The temporary anchor and object URL are cleaned up, and success is logged.

**Edge cases**

- Undefined deck entries serialize as `null` in arrays and import back as empty positions.
- Hidden buttons beyond the current grid are included.
- Config includes secrets currently stored in runtime config (OBS password and VTube Studio token); test and document this deliberate current behavior without using real credentials.
- Browser download/object URL failures are currently uncaught.

### CFG-002 — Import from file

**Happy path**

- Import File opens the hidden JSON file picker.
- Selecting a valid file reads text, validates/normalizes it, applies it, clears the input so the same file can be reselected, and logs success.

**Edge and failure cases**

- Picker cancellation performs no action.
- File read failure and invalid JSON are logged.
- MIME type is not programmatically enforced beyond the picker accept hint.

### CFG-003 — Import from URL

**Happy path**

- Submitting a non-empty URL fetches with `Accept: application/json`, disables the button, shows `Importing...`, applies valid content, and always restores the button.

**Edge and failure cases**

- Empty input returns without fetching.
- Non-2xx status logs the HTTP status.
- Network, CORS, mixed-content, body-read, JSON, and validation failures are logged.
- Repeated submission is blocked while the native button is disabled.
- Content type is not enforced if the response body is valid JSON.

### CFG-004 — Schema validation and normalization

**Happy path**

- A schema-v1 object with arrays for modules, custom URLs, and buttons imports.
- Missing/invalid export timestamp normalizes to an empty string and does not block import.
- Layout dimensions and button spans are clamped using normal deck rules.
- Button array grows to at least the current imported grid size.
- Non-string custom URLs are removed.
- Module config retains string-valued properties only; missing/invalid config becomes empty.
- Module `enabled` is true only for literal boolean `true`.

**Edge and failure cases**

- Null, primitive, or array root is rejected as not a JSON object.
- Missing or unsupported schema version is rejected.
- Missing/non-array modules, custom URLs, or deck buttons are rejected with the matching message.
- Non-object module entries or entries without a string ID reject the entire import.
- Invalid button entries normalize to empty positions rather than rejecting the import.
- Legacy buttons without label/spans normalize label to empty and spans to 1.
- Parameter objects currently retain arbitrary value types after button normalization; capture this current behavior.

### CFG-005 — Apply imported state

**Happy path**

- Custom URL storage, layout, and buttons are saved first.
- Imported custom modules load before module configurations are applied.
- Known runtime config merges over module defaults.
- A changed enabled flag uses the normal enable/disable lifecycle.
- Config/enabled values for unknown module IDs are still saved for future module availability.

**Edge and failure cases**

- A custom module load failure does not prevent subsequent URLs/config entries from being attempted.
- Runtime modules absent from the import retain their existing state.
- If enabled state is unchanged, config changes do not reconnect the module.
- Import is not transactional: failures during apply may leave partially applied storage/runtime state; tests should make this visible.
- Duplicate module entries apply sequentially; the last applicable values win.
- Duplicate custom URLs can be imported/stored as supplied, though runtime IDs still de-duplicate by ID.

## 6. Persistence and recovery

### STORE-001 — Storage keys and reload restoration

**Happy path**

- Theme, custom URLs, per-module config, per-module enabled flag, deck layout, and buttons use their documented independent keys.
- Reload restores each category without requiring another category to be valid.

**Edge cases**

- Corrupt JSON in deck buttons/layout/module config/custom URLs falls back only that category.
- Stored deck arrays grow to the grid minimum but are not truncated.
- Invalid button elements become empty positions.
- Local-storage write denial/quota errors are generally uncaught; browser tests should identify affected user actions.

## 7. Logging and console capture

### LOG-001 — Application log rendering

**Happy path**

- New entries are prepended with unique increasing IDs, direction, module name, message, and current timestamp.
- The list displays newest first, correct singular/plural count, machine-readable ISO datetime, and local display time.
- Direction values cover system, incoming, outgoing, error, and captured console output.
- At most 300 entries are retained.

**Edge cases**

- Entry 301 discards the oldest entry.
- Multiline and markup-containing messages remain escaped inside `pre`.
- Multiple entries in the same millisecond remain independently rendered.

### LOG-002 — Clear log

**Happy path**

- Clear removes all prior entries and immediately adds one `System — Log cleared` entry, leaving a count of one.

**Edge cases**

- Repeated clears remain at one newest confirmation entry.

### LOG-003 — Console interception

**Happy path**

- `console.log`, `console.warn`, and `console.error` still call their original browser methods.
- Log/warn are captured as console direction; error is captured as error direction.
- Multiple arguments are space-joined; strings remain unchanged and serializable values use JSON.

**Edge cases**

- `undefined`, functions, symbols, BigInt, and circular objects fall back to `String` where JSON cannot represent them.
- Objects whose serialization and/or string conversion throws expose current behavior without causing recursive console capture.

## 8. OBS connector

### OBS-001 — Connection lifecycle

**Happy path**

- Connect opens `ws://<host>:<port>`, closes a previous socket as replacement, reports connecting, logs the URL, then reports connected on open.
- Incoming text and non-text messages are logged.
- Disconnect reports disabled, closes with code 1000/reason `Module disabled`, clears the socket, and logs Disabled.
- Dispose closes with code 1000/reason `Module disposed` without a user-facing Disabled log.

**Edge and failure cases**

- WebSocket error reports error and a diagnostic log.
- Unexpected close reports error, code, and optional reason.
- Close after explicit disable remains disabled.
- Rapid replacement and stale old-socket events should be tested; unlike VTube Studio, OBS does not guard callbacks by active socket identity.
- Invalid host/port or WebSocket constructor failure currently escapes `connect`.

### OBS-002 — Hello/Identify handshake

**Happy path**

- A valid JSON op-0 Hello sends an op-1 Identify with RPC version capped at 1.
- Missing RPC version uses 1.
- Without authentication challenge, Identify is sent without authentication.
- With challenge and password, authentication equals Base64(SHA256(Base64(SHA256(password + salt)) + challenge)).

**Edge and failure cases**

- Challenge with no configured password logs an error and still sends Identify without authentication.
- Invalid JSON, non-string data, non-object JSON, or messages without `op` are ignored by handshake logic but still logged as incoming.
- Non-zero op messages do not produce Identify.
- Missing/malformed challenge or salt with a password documents current hash behavior.

### OBS-003 — Scene Change event

**Happy path**

- On an open socket, Scene Change sends op 6 `SetCurrentProgramScene` with a non-empty generated request ID and exact `sceneName`, and logs the outgoing JSON.

**Edge and failure cases**

- Closed/missing socket logs that an active OBS connection is required.
- An event without a message builder logs an error.
- Empty scene name is currently still sent; HTML `required` is not enforced by deck triggering.
- Repeated requests receive distinct probabilistic IDs under a deterministic random mock.

## 9. VTube Studio connector

### VTS-001 — Connection and authentication with saved token

**Happy path**

- Connect opens `ws://<host>:<port>`, resets authentication/handlers, closes the previous socket, reports connecting, and logs the URL.
- On open, a saved token sends `AuthenticationRequest` with API name/version and plugin identity.
- A matching successful response persists the token through the host, marks authenticated, reports connected, and logs success.

**Edge and failure cases**

- Responses without request ID or with unknown request ID are ignored after incoming logging.
- Each matching handler executes once and is removed.
- Stale socket message/error/close events are ignored using active-socket identity.
- Error reports diagnostic status/log; unexpected close clears auth/handlers and reports error.
- Explicit disable remains disabled, clears handlers/auth, and closes normally.

### VTS-002 — New token flow and retry

**Happy path**

- With no token, request `AuthenticationTokenRequest` using plugin name/developer.
- A returned token is immediately used for authentication.
- If a saved token is initially rejected, exactly one new-token flow is attempted, then authentication with that token is not configured to retry again.

**Edge and failure cases**

- Token response with `errorID` logs server message or fallback and closes the socket.
- Token response without a token logs and closes.
- Final authentication rejection logs server message or fallback and closes.
- A request attempted without an open socket logs an error and removes its pending handler.
- Current pending requests have no timeout; verify they remain until response, disconnect, replacement, or close.

### VTS-003 — Enable Animation event

**Happy path**

- On an open authenticated socket, sends a `HotkeyTriggerRequest` with API metadata, non-empty request ID, and exact animation name as `hotkeyID`.

**Edge and failure cases**

- Open but unauthenticated, closed, or missing socket logs that an authenticated connection is required.
- Missing builder logs an error.
- Empty animation name is currently sent.
- Invalid and non-string incoming JSON are ignored after logging.

## 10. Warudo connector

### WAR-001 — Connection lifecycle

**Happy path**

- Connect opens `ws://<host>:<port>`, replaces a prior socket, reports connecting/connected, and logs connection and incoming messages.
- Disable/dispose and normal/unexpected close follow the same state and close-reason expectations as OBS.

**Edge and failure cases**

- Error logs a Warudo-specific diagnostic.
- Non-string incoming data is stringified.
- Rapid replacement and stale callbacks are tested because callbacks are not guarded by socket identity.
- Invalid URL/constructor failure currently escapes connect.

### WAR-002 — Send Action event

**Happy path**

- On an open socket, sends JSON containing the exact action and `data` parsed from the user's JSON text.
- Test scalar, object, array, string, boolean, number, and null data.

**Edge and failure cases**

- Missing/closed socket logs that an active Warudo connection is required.
- Missing builder logs an error.
- Invalid or empty JSON throws from `JSON.parse`; this is current behavior to expose before hardening.
- Empty action is currently sent.

## 11. Example third-party module and module API contract

### API-001 — Example module

**Happy path**

- `/example-module.js` loads as `echo-example`, displays host/port settings, connects to `ws://<host>:<port>`, reports states, and logs incoming echo data.

**Edge cases**

- Error reports error; close after disable remains disabled; unexpected close reports error.
- The example has no events and therefore is absent from deck module choices.
- Repeated connect does not explicitly close its previous socket; capture current behavior.

### API-002 — Controller host isolation

**Happy path**

- Each controller reads only its runtime config, persists only its runtime values, updates only its runtime status, and attributes logs to its module name.

**Edge cases**

- Two modules with similar field names do not share values.
- Multiple simultaneous socket events preserve correct module attribution.

## 12. Build, static hosting, and deployment

### BUILD-001 — TypeScript and Vite build

**Happy path**

- `npm run build` passes strict TypeScript checking and emits the app to `dist`.
- OBS, Warudo, and VTube Studio emit as top-level `obs.js`, `warudo.js`, and `vtube-studio.js`; app chunks/assets emit under `assets/`.
- Production runtime loads built-in modules using relative URLs.
- Relative Vite base allows assets and module imports under a nested project path.

**Edge cases**

- A clean `npm ci` followed by build succeeds on Node 22/Linux as used in CI.
- Development uses source module URLs and production uses built files.
- Public fixtures (including the example module and config JSON) copy to output unchanged.

### BUILD-002 — GitHub Pages workflow

**Happy path**

- Push to `main` and manual dispatch run the workflow.
- Build checks out, installs with `npm ci`, builds, uploads `dist`, and deploys to GitHub Pages with the required permissions/environment URL.

**Edge cases**

- Build failure prevents deploy.
- Concurrent Pages runs are serialized and not canceled in progress.

## 13. Cross-cutting browser and quality scenarios

### X-001 — Responsive and interaction quality

- All views remain usable at narrow and wide widths; no control becomes unreachable.
- Deck remains square according to configured aspect ratio and fullscreen layout remains usable.
- Long module names, event names, labels, URLs, and log messages wrap or scroll without covering controls.
- Touch, mouse, and keyboard interaction do not double-trigger actions.

### X-002 — Accessibility semantics

- Primary navigation has an accessible label and current-page state.
- Buttons and form fields have visible/associated labels and keyboard operation.
- Module cards are keyboard focusable and support Enter/Space.
- Fullscreen exposes pressed state; decorative status dots and button images are hidden from assistive text.
- Hidden panels and edit-only controls are absent from the accessibility tree.
- Status changes and logs currently have no live-region announcement; document this current limitation.

### X-003 — Browser/security constraints

- Localhost WebSockets work from the supported serving context; secure-page mixed-content restrictions are documented/tested per target browser.
- Cross-origin module imports require correct CORS response headers.
- URL config import obeys fetch CORS and mixed-content policy.
- Remote images follow browser loading/security policy.
- No imported strings execute as HTML.
- Exported config is treated as sensitive because it can contain passwords/tokens and embedded images.

## 14. Suggested future automation map

| Area | Primary level | Key mocks/fixtures |
| --- | --- | --- |
| Normalizers, spans, labels, message builders | Unit | deterministic random, malformed values |
| Runtime/controller host and storage | Integration | localStorage, fake module/controller |
| OBS/VTS/Warudo protocols | Integration | controllable fake WebSocket |
| Dynamic module loading | Browser integration/E2E | valid, invalid, duplicate-ID ESM fixtures |
| Deck editing, navigation, logs, theme | Browser integration/E2E | seeded storage |
| Image workflow | Browser integration | image fixtures, canvas/Object URL mocks |
| Import/export | Integration/E2E | schema fixtures, fetch, File, download spies |
| Fullscreen | Browser integration/E2E | Fullscreen API mock plus real-browser smoke |
| Build/nested-path hosting | Build/E2E | production `dist` served below a subpath |
| Deployment | CI | workflow validation and Pages smoke check |

Before implementing tests, convert each feature ID into one or more named test cases and keep this inventory updated whenever behavior changes. A feature is not considered covered merely because its happy path is tested; its listed recovery, malformed-input, concurrency, and browser-boundary cases are part of the contract.
