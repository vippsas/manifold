# Manifold Plugins — Phase 1f Plan (`configuration` + Settings UI)

> REQUIRED SUB-SKILL: superpowers:subagent-driven-development.

**Goal:** `manifold.configuration.get(key, default)` returns `user-override ?? manifest-contributed-default ?? provided-default`; `onDidChange` fires when a value changes; gated by a `configuration` capability. Add a **"Plugins" tab in the Settings modal** that renders each plugin's contributed config schema as editable fields, persisting overrides.

**Design (chosen — full / option C):** overrides live in `ManifoldSettings.pluginConfig[pluginId][key]` (persisted by `SettingsStore`). The config flow is self-contained in the plugin system via dedicated IPC (`plugins:get-config`, `plugins:set-config`) — it does NOT piggyback the Settings modal's `onSave`. Host config + onDidChange mirror the storage/workspace patterns (a shared `ConfigContext` keyed by pluginId + a per-plugin gated namespace).

**Verification:** host config api + gating + `$onDidChange` round-trip are unit/in-memory tested; `PluginManager.getConfigValue` merge is unit-tested; `PluginSettingsSection` has a React Testing Library test. The Settings panel visuals + real process are dev-smoke. Gates: `typecheck:node` ≤ 16, `typecheck:web` ≤ 37, no error names a new file.

## Data flow
```
get:   plugin manifold.configuration.get(key, def) → HOST_CONFIG.$get(pluginId,key)
         → PluginManager.getConfigValue = settings.pluginConfig[id][key] ?? manifest default → (?? def in host)
set:   Settings "Plugins" tab → invoke('plugins:set-config', id, key, value)
         → PluginManager.setConfig → SettingsStore.updateSettings(pluginConfig) → ExtensionHost.notifyConfigChanged(id)
         → host PLUGIN_CONFIG.$onDidChange(id) → fires plugin's manifold.configuration.onDidChange listeners
```

## File Structure
**Create:** `src/plugin-host/config-api.ts` (+ `config-api.test.ts`), `src/renderer/components/modals/settings/PluginSettingsSection.tsx` (+ test).
**Modify:** `src/shared/plugins/rpc.ts` (+`HOST_CONFIG`,`PLUGIN_CONFIG`), `src/shared/plugins/api-types.ts` (+`configuration`), `src/shared/plugins/manifest.ts` (type `contributes.configuration`), `src/shared/types.ts` (`ManifoldSettings.pluginConfig`), `src/shared/defaults.ts` (`pluginConfig: {}`), `src/plugin-host/gated-api.ts` (factories +`configuration`) + test, `src/plugin-host/index.ts` (ConfigContext + `PLUGIN_CONFIG` + factory), `src/main/plugins/extension-host-integration.test.ts` (config round-trip), `src/main/plugins/extension-host.ts` (`HOST_CONFIG` + `notifyConfigChanged` + `setConfigResolver`), `src/main/plugins/plugin-manager.ts` (settingsStore + getConfigValue/getConfig/setConfig), `src/main/app/index.ts` (pass settingsStore to PluginManager), `src/main/ipc/plugin-handlers.ts` (+2 channels), `src/preload/index.ts` (+2 channels), `src/renderer/components/modals/settings/SettingsModalBody.tsx` (+`plugins` tab), `resources/plugins/hello/{package.json,out/plugin.js}`.

---

### Task 1 (G1): Host configuration API + gating + types

- [ ] **Step 1:** `rpc.ts` — add `export const HOST_CONFIG = 'HostConfig'` and `export const PLUGIN_CONFIG = 'PluginConfig'`.
- [ ] **Step 2:** `src/shared/plugins/manifest.ts` — type `contributes.configuration`:
```ts
export interface PluginConfigurationProperty {
  type: 'string' | 'number' | 'boolean'
  default?: unknown
  description?: string
  enum?: string[]
}
export interface PluginConfiguration {
  title?: string
  properties?: Record<string, PluginConfigurationProperty>
}
```
and change `PluginContributions.configuration?: unknown` → `configuration?: PluginConfiguration`.
- [ ] **Step 3:** `src/shared/plugins/api-types.ts` — add to `ManifoldApi`:
```ts
  configuration: {
    get<T = unknown>(key: string, defaultValue?: T): Promise<T | undefined>
    onDidChange(listener: () => void): Disposable
  }
```
- [ ] **Step 4:** Create `src/plugin-host/config-api.ts`:
```ts
// src/plugin-host/config-api.ts
import { HOST_CONFIG, type RpcEndpoint } from '../shared/plugins/rpc'
import type { Disposable, ManifoldApi } from '../shared/plugins/api-types'

interface HostConfigProxy { $get(pluginId: string, key: string): Promise<unknown> }

/** Host-side config: shared per-plugin onDidChange listeners + a get() over HOST_CONFIG. */
export class ConfigContext {
  private readonly listeners = new Map<string, Set<() => void>>()

  /** Called (via the PLUGIN_CONFIG service) when a plugin's config changed in main. */
  notifyChanged(pluginId: string): void {
    const set = this.listeners.get(pluginId)
    if (set) for (const listener of set) listener()
  }

  /** Per-plugin `manifold.configuration` namespace. */
  makeApi(endpoint: RpcEndpoint, pluginId: string): ManifoldApi['configuration'] {
    const host = endpoint.getProxy<HostConfigProxy>(HOST_CONFIG)
    const listeners = this.listeners
    return {
      async get<T>(key: string, defaultValue?: T): Promise<T | undefined> {
        const value = (await host.$get(pluginId, key)) as T | undefined
        return value === undefined ? defaultValue : value
      },
      onDidChange(listener: () => void): Disposable {
        let set = listeners.get(pluginId)
        if (!set) { set = new Set(); listeners.set(pluginId, set) }
        set.add(listener)
        return { dispose: () => { set!.delete(listener) } }
      },
    }
  }
}
```
- [ ] **Step 5:** `src/plugin-host/gated-api.ts` — add `configuration: () => ManifoldApi['configuration']` to `GatedFactories`, and a `configuration` getter gated by `'configuration'`:
```ts
    get configuration(): ManifoldApi['configuration'] {
      if (!caps.has('configuration')) throw new CapabilityError('configuration')
      return factories.configuration()
    },
```
- [ ] **Step 6:** `src/plugin-host/index.ts` — create `const configContext = new ConfigContext()`; register `endpoint.registerService(PLUGIN_CONFIG, { $onDidChange: (pluginId: string) => configContext.notifyChanged(pluginId) })`; add `configuration: () => configContext.makeApi(endpoint, t.id)` (and `''` for the default api) to BOTH `buildGatedApi` factory objects.
- [ ] **Step 7:** Update `gated-api.test.ts` factory objects to include `configuration: () => (...)`; add gating cases (throws without `configuration`; present with it).
- [ ] **Step 8:** Create `config-api.test.ts`: `notifyChanged` fires only the listeners for that pluginId; a disposed listener stops; `makeApi(...).get` returns the `defaultValue` when the host returns `undefined` (wire a fake `HOST_CONFIG` returning undefined).
- [ ] **Step 9:** Extend `extension-host-integration.test.ts`: wire `ConfigContext` + a fake main `HOST_CONFIG` (`$get` from an in-memory map) + `PLUGIN_CONFIG` host service; build a gated api with `['configuration']`; assert `await api.configuration.get('k', 'd')` returns the map value (or 'd' when absent); register `onDidChange`, call the main proxy `$onDidChange(pluginId)`, assert the listener fired; assert `buildGatedApi([], ...)` → `.configuration` throws `CapabilityError`.
- [ ] **Step 10:** `npx vitest run src/plugin-host src/main/plugins/extension-host-integration.test.ts src/shared/plugins` → pass. `typecheck:node` ≤ 16. Commit `feat(plugins): add configuration host API + capability gating`.

---

### Task 2 (G2): Main config store + merge + IPC

- [ ] **Step 1:** `src/shared/types.ts` — add to `ManifoldSettings`: `pluginConfig?: Record<string, Record<string, unknown>>`. `src/shared/defaults.ts` — add `pluginConfig: {}` to `DEFAULT_SETTINGS`.
- [ ] **Step 2:** `src/main/plugins/extension-host.ts` — import `HOST_CONFIG, PLUGIN_CONFIG`; add a `private getConfig: ((pluginId: string, key: string) => unknown) | null = null` + `setConfigResolver(fn)`; register in `ensure()`:
```ts
endpoint.registerService(HOST_CONFIG, { $get: (pluginId: string, key: string) => this.getConfig?.(pluginId, key) })
```
and add `notifyConfigChanged(pluginId: string): void { const { endpoint } = this.ensure(); void endpoint.getProxy<{ $onDidChange(id: string): Promise<void> }>(PLUGIN_CONFIG).$onDidChange(pluginId) }`.
- [ ] **Step 3:** `src/main/plugins/plugin-manager.ts` — constructor now `(storagePath: string, private readonly settings: import('../store/settings-store').SettingsStore)`. In the constructor, after creating `this.host`, call `this.host.setConfigResolver((id, key) => this.getConfigValue(id, key))`. Add:
```ts
getConfigValue(pluginId: string, key: string): unknown {
  const override = this.settings.getSettings().pluginConfig?.[pluginId]?.[key]
  if (override !== undefined) return override
  const plugin = this.plugins.find((p) => p.id === pluginId)
  return plugin?.manifest.contributes?.configuration?.properties?.[key]?.default
}
getConfig(pluginId: string): { properties: Record<string, unknown>; values: Record<string, unknown> } {
  const plugin = this.plugins.find((p) => p.id === pluginId)
  const properties = plugin?.manifest.contributes?.configuration?.properties ?? {}
  const values: Record<string, unknown> = {}
  for (const key of Object.keys(properties)) values[key] = this.getConfigValue(pluginId, key)
  return { properties, values }
}
setConfig(pluginId: string, key: string, value: unknown): void {
  const current = this.settings.getSettings().pluginConfig ?? {}
  const pluginValues = { ...(current[pluginId] ?? {}), [key]: value }
  this.settings.updateSettings({ pluginConfig: { ...current, [pluginId]: pluginValues } })
  this.host.notifyConfigChanged(pluginId)
}
```
- [ ] **Step 4:** `src/main/app/index.ts` — change `new PluginManager(settingsStore.getSettings().storagePath)` → `new PluginManager(settingsStore.getSettings().storagePath, settingsStore)`.
- [ ] **Step 5:** `src/main/ipc/plugin-handlers.ts` — add:
```ts
  ipcMain.handle('plugins:get-config', (_e, pluginId: string) => deps.pluginManager.getConfig(pluginId))
  ipcMain.handle('plugins:set-config', (_e, pluginId: string, key: string, value: unknown) => { deps.pluginManager.setConfig(pluginId, key, value); return true })
```
- [ ] **Step 6:** `src/preload/index.ts` — add `'plugins:get-config'`, `'plugins:set-config'` to `ALLOWED_INVOKE_CHANNELS`.
- [ ] **Step 7:** Add a `plugin-manager.config.test.ts` (or extend `plugin-manager.test.ts`) covering `getConfigValue` with a fake SettingsStore: override wins; falls back to manifest default; `undefined` when neither. (Construct PluginManager with a fake `settings` exposing `getSettings`/`updateSettings`, and seed `this.plugins` — note `plugins` is private; instead test via a tiny exported pure helper OR test `getConfig`/`getConfigValue` by constructing a PluginManager, calling a method that sets plugins... If `plugins` is private with no setter, prefer extracting a pure `mergeConfigValue(override, manifestDefault)` helper and unit-test that.) Keep it pure + unit-tested.
- [ ] **Step 8:** `typecheck:node` ≤ 16; `npm run build` OK. Commit `feat(plugins): plugin config store (settings-backed merge) + IPC`.

---

### Task 3 (G3): Settings "Plugins" tab UI

- [ ] **Step 1:** `src/renderer/components/modals/settings/SettingsModalBody.tsx` — add `'plugins'` to `SettingsTabId`; add `{ id: 'plugins', label: 'Plugins' }` to `SETTINGS_TABS`; render `{props.activeTab === 'plugins' && <PluginSettingsSection />}` (import it). `PluginSettingsSection` is self-contained (fetches its own data), so no new props are threaded.
- [ ] **Step 2:** Create `src/renderer/components/modals/settings/PluginSettingsSection.tsx` — a self-contained component:
  - On mount: `const plugins = await invoke('plugins:list')` (array of descriptors with `id`, `manifest.displayName`, `manifest.contributes?.configuration`). Filter to those whose `manifest.contributes?.configuration?.properties` is non-empty. For each, `const { properties, values } = await invoke('plugins:get-config', plugin.id)`.
  - Render via `SectionHeader`/`SectionCard` (from `./SettingsSectionLayout`): one card per plugin (title = displayName), and for each property render a type-aware field — `boolean`→checkbox, `number`→number input, `enum`→select, else text input — labeled by key + `description`. Initialize from `values[key]`.
  - On change: update local state AND `void invoke('plugins:set-config', plugin.id, key, value)` (apply immediately; persisted in main).
  - Empty state: if no plugins contribute configuration, show a short "No plugins with settings installed." message.
  - Keep it dependency-free (no new libs); match the existing section components' style.
- [ ] **Step 3:** Create `PluginSettingsSection.test.tsx` (RTL) — mock `window.electronAPI` so `plugins:list` returns one plugin with a `string` + `boolean` property and `plugins:get-config` returns matching values; assert the fields render with initial values; simulate a change and assert `invoke('plugins:set-config', ...)` was called with the new value.
- [ ] **Step 4:** `typecheck:web` ≤ 37 (paste; no error names the new files). `npx vitest run src/renderer/components/modals/settings/PluginSettingsSection.test.tsx` → pass. Commit `feat(plugins): add Plugins tab to Settings for configuration`.

---

### Task 4 (G4): Reference plugin uses configuration + build + smoke

- [ ] **Step 1:** `resources/plugins/hello/package.json` — set `"capabilities": ["storage", "workspace:read", "configuration"]`; add to `contributes`:
```json
    "configuration": {
      "title": "Hello",
      "properties": {
        "greeting": { "type": "string", "default": "Hello", "description": "Greeting shown in the panel." }
      }
    }
```
- [ ] **Step 2:** `resources/plugins/hello/out/plugin.js` — in `resolveWebviewView`, read `const greeting = await manifold.configuration.get('greeting', 'Hello')`, render it in the heading, and `context.subscriptions.push(manifold.configuration.onDidChange(async () => { view.webview.postMessage({ type: 'greeting', value: await manifold.configuration.get('greeting', 'Hello') }) }))`; in the webview script, handle `type === 'greeting'` to update the heading. Keep counter/ping/project. (`git add -f`.)
- [ ] **Step 3:** `node --check resources/plugins/hello/out/plugin.js && echo "syntax ok"`; `npm run build` OK; typechecks at baseline. Commit `feat(plugins): Hello plugin reads a configurable greeting`.
- [ ] **Step 4 (dev smoke — NOT CI):** `npm run dev` → "+ Apps" → Hello panel shows the greeting; open Settings → **Plugins** tab → change "Greeting"; confirm the panel updates live (onDidChange) and the value persists across reload. Record the result.

---

## Self-Review (this plan)
- **Spec coverage (design spec §6.7 configuration + §6.9 capabilities):** host config api + gating (Task 1), settings-backed merge + IPC (Task 2), Settings UI (Task 3), reference plugin (Task 4).
- **Verifiability:** ConfigContext + gating + `$onDidChange` round-trip unit/integration tested; merge helper unit-tested; `PluginSettingsSection` RTL-tested. Panel visuals + process are dev-smoke.
- **Type consistency:** `HOST_CONFIG`/`PLUGIN_CONFIG` used by `config-api`/`index`/`extension-host`; `PluginConfiguration` typed in manifest + consumed by `getConfig` + the UI; `ManifoldApi.configuration` implemented by `ConfigContext.makeApi`; `buildGatedApi` factories grow to `{storage, workspace, configuration}` — update gated-api, its test, the integration test, and index.ts together.
- **Self-contained UI:** the Plugins tab uses dedicated `plugins:get-config`/`set-config` IPC, not the modal's `onSave` — no prop threading through SettingsModal/Body.
