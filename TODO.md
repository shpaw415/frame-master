# TODO before 3.1.0

### Enhancements

- [x] CLI create plugin with linked packageJson name and version to the plugin name and version.
- [x] Stop onLoad Plugin chaining with return value `{ preventChaining: true }`
- [x] Add a props in `FrameMasterConfig.pluginsOptions` introducing `entrypoints` for a quick way to add entrypoints to the buildStep

### Features

- [x] Extendable directive interface type to extend current "use-server", "use-client", etc...
- [x] implement search plugin from cli
- [x] implement search template from cli
- [x] Extend Bun.PluginBuilder to include finally. adding a final modification to a specific loader before sending it to the Bun.bundler final content.

### Fixes

#### Apply in 3.0.2

- [x] plugin chaining virtual module throw error when chained.
- [x] directiveTool throws when the file does not exists.
