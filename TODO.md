# TODO before 3.1.0

### Enhancements

- CLI create plugin with linked packageJson name and version to the plugin name and version.
- Stop onLoad Plugin chaining with return value `{ preventChaining: true }`
- Entire rewrite of directiveTool to extend with configs.

### Features

- Extendable directive interface type

### Fixes

#### Apply in 3.0.1

- [x] CLI create plugin README.md name variable.
- Directive Tool not linked to the FrameMasterConfig.diretives config entry.
- [x] (request-manager) Only Apply (applyModifiers) HTML_rewrite & GlobalValueInjection when contentType = text/html
