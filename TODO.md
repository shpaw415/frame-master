# TODO before 3.1.0

### Enhancements

- CLI create plugin with linked packageJson name and version to the plugin name and version.
- Stop onLoad Plugin chaining with return value `{ preventChaining: true }`
- Add a props in `FrameMasterConfig.pluginsOptions` introducing `entrypoints` for a quick way to add entrypoints to the buildStep
- Plugin creation helper method that require a callback function. passing plugins toolings `{directives, builder}` as a props to the callback.
-

### Features

- Extend Bun.PluginBuilder to include finally. adding a final modification to a specific loader before sending it to the Bun.bundler final content. Exemple:
- Extendable directive interface type to extend current "use-server", "use-client", etc...

```typescript
runtime.finally("html", ({ contents }: { contents: string | ArrayBuffer }) => ({
  contents: `/** final transform */${contents}`,
}));
```

### Fixes

#### Apply in 3.0.1

- [x] CLI create plugin README.md name variable.
- [x] Directive Tool not linked to the FrameMasterConfig.diretives config entry.
- [x] (request-manager) Only Apply (applyModifiers) HTML_rewrite & GlobalValueInjection when contentType = text/html
- [x] plugin chaining must be matching when no namespace is provided as a global maching patern.
