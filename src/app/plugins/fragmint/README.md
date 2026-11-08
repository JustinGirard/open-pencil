# Open Pencil Fragmint Plugin

## Scope

This directory contains the OpenPencil-side Fragmint plugin runtime used when OpenPencil is mounted under `/editor`.

Authoritative architecture and ownership references:

- `docs/openpencil_embed_architecture_guide.md` (primary for current embed path)
- `docs/application_env_web_bridge_guide.md` (legacy bridge behavior; reference only)

Current forward path:

`Sign-in host -> /editor mount -> OpenPencil -> Fragmint plugin -> Unity runtime`

---

## Ownership Boundaries

Per architecture guide:

- **Sign-in host owns**
  - auth/session lifecycle
  - route/nav gating
  - process orchestration and proxy boundaries
- **OpenPencil Fragmint plugin owns**
  - plugin registration and activation
  - center-view lifecycle inside editor
  - Unity host lifecycle and bridge payload injection
- **Legacy sign-in Unity path owns**
  - direct React `unity_web` embedding and legacy registration flow

---

## Directory Overview

- `FragmintPlugin.ts`
  - plugin registration: route, left panel section, center view contribution, event handling
- `views/`
  - `FragmintLeftSection.vue`: toggles `center_plugin=fragmint`
  - `FragmintCenterView.vue`: center override host and deactivation watchers
  - `FragmintPluginView.vue`: plugin route surface
  - `FragmintUnityHost.vue`: Unity boot + bridge message injection
- `unity/`
  - `manifest.ts`: Unity manifest fetch/validation
  - `bridgeConfig.ts`: startup config assembly and pre-BaseData diagnostics
  - `bridgePayloads.ts`: ApplicationEnv payload composition and bridge sends
- `state/centerMode.ts`
  - center deactivation signal used by plugin event lifecycle
- `sharedStorage.js`
  - localStorage accessor used by bridge config assembly
- `baseUrl.ts`
  - `getFragmintBaseUrl()` accessor used by bridge config URL construction

Planned shared helper area:

- `utils/`
  - reusable plugin-local pure helpers (URL/path/query/payload helpers)
  - avoid placing Unity-runtime side effects in `utils`

---

## Runtime Flow (Current)

1. User activates Fragmint center mode from the left section (`center_plugin=fragmint`).
2. Center override mounts `FragmintUnityHost`.
3. `FragmintUnityHost`:
   - resolves bridge config (`resolveFragmintBridgeConfig`)
   - fetches Unity manifest
   - loads Unity loader script
   - creates Unity instance
4. On readiness, host sends:
   - `UpsertAndSelectServerRegistration` with startup env payload
   - optionally `ConfigureSingleGraphViewer` when `graph_path` is present
5. Plugin deactivates center mode when page selection changes or deactivation event is emitted.

---

## Configuration Contract (Current Snapshot)

`bridgeConfig.ts` currently:

- reads legacy content/section descriptors from:
  - `/fragmint_content.json`
  - section JSON path under `content.sections[0]`
- reads session credentials from:
  - localStorage key `basepage_signin_demo.server_session`
- enriches the session object with:
  - `server_url`
  - `req_mode: "mcp_http_service"`
- constructs `LegacyServerSessionSpec` with nested `remote`:
  - `server_url <- sessionRaw.server_url`
  - `user_email <- sessionRaw.email`
  - `user_token <- sessionRaw.auth_token`

`bridgePayloads.ts` sends server registration under:

- `servers[remoteName] = { req_mode, server_url, user_email, user_token }`
- `selected_server = remoteName`

---

## Known Open Integration Gaps

From the embed architecture guide (current known work):

- Canonical auth handoff contract from sign-in React state into OpenPencil plugin runtime is not fully formalized.
- Dist/live route parity must stay aligned across:
  - sign-in proxy mount
  - OpenPencil base path
  - plugin runtime fetch/send paths
- Legacy/new coexistence policy remains explicit migration territory, not complete removal.

---

## Rules for Future Additions

1. Keep Fragmint plugin helpers reusable and plugin-local.
2. Put pure shared helpers in `utils/` (no side effects, no Unity instance state).
3. Keep Unity runtime side effects in `views/FragmintUnityHost.vue` and `unity/*`.
4. Preserve fail-fast behavior for required runtime configuration (no silent fallback defaults).
5. When bridge behavior changes, update:
   - this README
   - `docs/openpencil_embed_architecture_guide.md`
   - and, if legacy behavior is touched, `docs/application_env_web_bridge_guide.md`
