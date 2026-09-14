# Editor, Chat and Shell Regression Checks

Run in the project directory:

```sh
node --test tests/*.test.cjs
node tests/template-runtime.cjs
node tests/editor-browser.cjs
npx tsc --noEmit
npx expo export --platform android --output-dir /tmp/devflux-android-validation
```

The PTY test needs Linux, util-linux (script/stty) and bash. It starts an
isolated interactive shell and verifies cursor editing by checking the command
result, then checks resize, Ctrl+C and Ctrl+D. It does not require Android.

The browser check needs Playwright and Chromium. Set PLAYWRIGHT_PACKAGE to an
existing Playwright package path and BROWSER_CHANNEL to a supported installed
browser channel if needed. It loads the actual Monaco/Ace CDN scripts and the
bundled xterm code. Clipboard replies and save requests use a simulated native
host; native clipboard API routing is covered separately with a mocked API.

The state tests exercise ready-before-content ordering, empty files, toolbar
acknowledgements, focus isolation, current project selection and the saved AI
configuration passed to the request. They do not make external AI requests.

## BYOK, Templates and File Selection

The additional regression tests reproduce and verify:

- React and Node previously returned without source files or package.json.
- Blank projects stay blank; duplicate names do not overwrite existing projects.
- Empty files are real files, not missing paths in the web filesystem.
- Switching projects with the same filename, selecting the same Explorer path
  again, late file responses, and a source file named shell.js.
- Provider/model/key consistency between Chat and connection testing, catalog
  pagination, error classification, redaction, serialized settings persistence,
  and explicit draft saving in the BYOK form.
- NPM success/failure/failed dispatch and listener cleanup.
- Expanded Shell bounds after resizing and real xterm row bounds with typing
  space in normal and reduced viewports.

template-runtime.cjs uses the native FileSystemService branch with Expo filesystem
calls backed by real temporary Linux files. It installs the generated dependencies,
builds React with Vite, and verifies the generated Node/Express server over HTTP.
It removes only its own temporary projects and stops the test server.
This requires npm/network access; it does not run Android PRoot.

The React template uses the Vite 5 line for compatibility with Node 21 in existing
Android runtimes. Scaffolding itself is local and does not need npm or Live Sync.
The wizard awaits dependency installation separately and offers retry on failure.
Existing incomplete projects are not automatically overwritten.

### BYOK Browser Check

Bundle the real screen, settings context, API service, theme and icons with a
small native-host fixture. The fixture substitutes storage/header/insets and
intercepts API responses; no real keys or paid AI calls are used.

```sh
npm install --prefix /tmp/devflux-ui-validation --no-audit --no-fund esbuild
ESBUILD_PACKAGE=/tmp/devflux-ui-validation/node_modules/esbuild node tests/byok-browser-build.cjs
node tests/byok-browser.cjs
```

BYOK_BUNDLE overrides the generated bundle path when the browser driver runs on
another host (for example Windows accessing the WSL temporary directory).
The check covers widths 360/412/1024, catalog selection, saved configuration
switching, exact request credentials/model, header count and reduced viewport
input bounds. Screenshots are written to the driver's temporary directory.

## Project Play and Cursor Controls

The controls browser fixture renders CodigoScreen, BrowserPlayButton and
KeyboardToolbar with React Native Web. Only the native host, project files,
editor pane and terminal sheet are substituted. The cursor browser check
separately runs real Monaco, Ace and the bundled xterm.

```sh
ESBUILD_PACKAGE=/tmp/devflux-ui-validation/node_modules/esbuild node tests/project-controls-browser-build.cjs
CONTROLS_BUNDLE=/tmp/devflux-ui-validation/controls.js node tests/project-controls-browser.cjs
node tests/cursor-browser.cjs
```

Use a Windows-accessible CONTROLS_BUNDLE path when the browser driver runs on
Windows. Screenshots are written to that driver's temporary directory.

Reproduced before changes:
- At 320 px the header exhausted its width and lost Play's right inset.
  The existing icon min/max width did not constrain the actions group.
- The pending-action label shifted an arrow by about 74 px, outside a 412 px
  viewport, then moved it again on acknowledgement.
- A virtual xterm arrow bypassed IME finalization and reached the PTY without
  the composing text. The regression also covers a late compositionend so
  already committed text cannot be sent twice.
- Monaco and Ace handled Ctrl+Left as one character instead of one word.

The fix reserves Play's non-shrinking slot inside the header's right inset
and lets the other actions scroll only when their pane is too narrow.
Pending actions only change selection, not the main toolbar geometry.
Ctrl choices use a separate row without moving the arrow row.
Xterm receives cursor keydown/keyup through its own handler, finalizes the
composing text first, clears that committed textarea buffer, and acknowledges
the action. Programmatic toolbar focus cannot claim native input ownership.
Monaco/Ace use their word-navigation commands for Ctrl+Left/Right.
Artificial Play loading and error-reset delays were removed.

Coverage includes widths 320/360/369/412/900/1024; Play loading, preview,
return, failure and retry; repeated touches and acknowledgement; Ctrl and
Ctrl+Shift navigation, vertical arrows, a 20-arrow xterm burst, IME ordering
and duplicate prevention. The Linux PTY test checks real insertion/deletion
at the cursor, Up/Down history, resizing, Ctrl+C and EOF.

The exact tap-only header shift at the reported phone width did not reproduce
in React Native Web. This is not proof that the Android/Yoga issue is resolved;
the updated APK must still be checked on the affected device.

## Android Verification Still Required

Rebuild the APK after adding expo-clipboard. Existing Alpine installations
prepare util-linux-misc when opening the shell; new setup includes it.

On a device, check both editors on cold project startup, type with Gboard,
select text and use Ctrl+C/X/V/Z/S. Test Ctrl followed by a Gboard letter,
switch between files and shell sessions with Ctrl armed, and open Chat from
the current project. Confirm that the composer remains visible above both the
navigation bar and keyboard, and that messages still scroll.

Browser IME event simulation and an Android bundle export do not replace this
device test. The Android SDK is installed, but no Android device is connected.
Real provider access, billing/quota and model availability must also be tested
with the user's saved configuration on the device. An unavailable model is not
silently replaced with a different model.

Implementation references:
- [Expo Clipboard SDK 57](https://docs.expo.dev/versions/v57.0.0/sdk/clipboard/)
- [Expo Router migration](https://docs.expo.dev/router/migrate/sdk-55-to-56/)
- [util-linux script](https://www.man7.org/linux/man-pages/man1/script.1.html)
- [xterm terminal API](https://xtermjs.org/docs/api/terminal/classes/terminal/)
- [Gemini model catalog](https://ai.google.dev/api/models)
- [Gemini OpenAI compatibility](https://ai.google.dev/gemini-api/docs/openai)
- [OpenAI model catalog](https://platform.openai.com/docs/api-reference/models/list)
- [OpenRouter model catalog](https://openrouter.ai/docs/api/api-reference/models/list-all-models-and-their-properties)
- [Vite 5 runtime requirements](https://v5.vite.dev/guide/)
