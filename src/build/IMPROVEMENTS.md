# Frame-Master Build System Improvements

## Overview

This document outlines the improvements made to Frame-Master's build system and documentation to enhance developer experience and modularity.

## 1. README Rewrite ✅

### What Changed

- **Clearer positioning**: Frame-Master is now clearly described as a "plugin orchestration runtime" rather than a vague "framework maker"
- **Emphasized zero built-in behavior**: Made it crystal clear that Frame-Master has NO opinions, routes, or renderers by default
- **Singleton builder pattern**: Thoroughly explained how all plugins share one build pipeline
- **Runtime vs Build plugins**: Clear distinction between the two plugin systems
- **Better examples**: Replaced generic examples with concrete use cases (SSR, API server, SSG)

### Key Sections Added

- Architecture diagram with layered explanation
- "What Makes Frame-Master Different" with clear positioning
- "The Singleton Builder Pattern" section
- "Runtime Plugins vs Build Plugins" comparison
- Practical use case examples

## 2. Builder API Enhancements ✅

### New Public Methods

#### `getConfig(): Bun.BuildConfig | null`

Access the current merged build configuration from all plugins.

```typescript
const config = builder.getConfig();
console.log("Building for:", config?.target);
```

#### `analyzeBuild()`

Get detailed analysis of build outputs including sizes, artifact types, and optimization suggestions.

```typescript
const analysis = builder.analyzeBuild();
console.log("Total size:", analysis.totalSize);
console.log("Largest files:", analysis.largestFiles);
console.log("By kind:", analysis.byKind);
```

Returns:

- `totalSize`: Total bytes of all artifacts
- `averageSize`: Average file size
- `artifacts`: Array of all build outputs with metadata
- `largestFiles`: Top 10 largest files
- `byKind`: Statistics grouped by artifact kind (entry-point, chunk, etc.)

#### `generateReport(format: "text" | "json")`

Generate human-readable or machine-parseable build reports.

```typescript
// Console-friendly report
console.log(builder.generateReport("text"));

// Structured data for monitoring
const report = builder.generateReport("json");
await sendToMonitoring(JSON.parse(report));
```

#### `getBuildHistory()`

Access historical build data for performance tracking.

```typescript
const history = builder.getBuildHistory();
const avgDuration =
  history.reduce((s, b) => s + b.duration, 0) / history.length;
console.log("Average build time:", avgDuration.toFixed(2), "ms");
```

#### `clearBuildHistory()`

Reset build history tracking.

```typescript
builder.clearBuildHistory();
```

### Build Tracking

- Added `buildHistory` array to track all builds with timing and success metrics
- Tracks: timestamp, duration, entrypoints, output count, success status

## 3. Type-Safe Config Helper ✅

### `defineBuildConfig<T>(config: T): T`

Identity function that provides full TypeScript autocomplete and validation.

```typescript
import { defineBuildConfig } from "frame-master/build";

buildConfig: defineBuildConfig({
  target: "browser", // Full autocomplete!
  external: ["react", "react-dom"],
  minify: true,
  // TypeScript catches typos and invalid values
});
```

Benefits:

- Zero runtime overhead (identity function)
- Full IntelliSense support
- Type checking for all Bun.BuildConfig properties
- Prevents common configuration errors

## 4. Enhanced Documentation ✅

### BuildOptionsPlugin Type Documentation

Completely rewritten with:

#### Static vs Dynamic Config

Clear explanation of when to use each:

- **Static (object)**: Merged on import, for constants
- **Dynamic (function)**: Called on build, for runtime decisions

#### Singleton Pattern Explanation

Detailed description of how all plugins share the builder:

- How configs merge intelligently
- Order of hook execution
- Access to shared builder instance

#### Comprehensive Examples

Every hook now has 2-3 practical examples:

- Basic usage
- Advanced patterns
- Common use cases

#### Intelligent Merging Documentation

Explained how different config types merge:

- Arrays: Deduplicated and concatenated
- Objects: Deep merged
- Plugins: Concatenated (preserve order)
- Primitives: Last wins with warning

## 5. Benefits Summary

### For Plugin Developers

1. **Better debugging**: `analyzeBuild()` and `generateReport()` provide instant insights
2. **Type safety**: `defineBuildConfig()` prevents configuration errors
3. **Performance tracking**: Build history helps identify regressions
4. **Clear patterns**: Documentation shows static vs dynamic config usage
5. **Singleton understanding**: Clear mental model of how plugins interact

### For Framework Users

1. **Clearer README**: Understand Frame-Master's unique positioning
2. **Better examples**: See real use cases instead of abstract concepts
3. **Plugin transparency**: Understand how plugins work together

### For Modularity

1. **Separation of concerns**: Runtime vs build plugins clearly distinguished
2. **Composable pipeline**: Singleton pattern enables clean plugin composition
3. **Observable builds**: Analysis API makes the build process transparent
4. **Extensible**: New helpers don't break existing plugins

## 6. Implementation Details

### Files Modified

- `/home/shpaw415/frame-master/README.md` - Complete rewrite
- `/home/shpaw415/frame-master/src/build/index.ts` - Added 6 new public methods
- `/home/shpaw415/frame-master/src/plugins/types.ts` - Enhanced documentation

### Backward Compatibility

✅ All changes are backward compatible:

- New methods are additive
- Existing API unchanged
- Documentation improvements only

### TypeScript Improvements

- Fixed type errors in `analyzeBuild()`
- Added proper return types for all new methods
- Generic type support in `defineBuildConfig()`

## 7. Future Considerations

### Potential Additions (Not Implemented)

These were discussed but not implemented to keep scope focused:

1. **Incremental builds**: Detect changed files and build only what's needed
2. **Build profiles**: Preset configurations for dev/prod/test
3. **Build middleware**: Wrap builds with timing/validation/transformation
4. **Watch mode integration**: Better file watching hooks
5. **Parallel builds**: Build multiple entry groups simultaneously
6. **Config validation**: Pre-build configuration validation
7. **Build caching**: Hash-based cache for faster rebuilds

These can be added in future iterations without breaking changes.

## 8. Usage Examples

### Example 1: Bundle Size Monitoring

```typescript
export function monitoringPlugin(): FrameMasterPlugin {
  return {
    name: "monitoring-plugin",
    build: {
      afterBuild: async (config, result, builder) => {
        const analysis = builder.analyzeBuild();

        if (analysis.totalSize > 2_000_000) {
          console.error("❌ Bundle exceeds 2MB limit!");
          process.exit(1);
        }

        // Send to monitoring service
        await fetch("https://monitor.example.com/builds", {
          method: "POST",
          body: builder.generateReport("json"),
        });
      },
    },
  };
}
```

### Example 2: Performance Tracking

```typescript
export function perfPlugin(): FrameMasterPlugin {
  return {
    name: "perf-plugin",
    build: {
      afterBuild: async () => {
        const history = builder.getBuildHistory();
        const last10 = history.slice(-10);
        const avgTime =
          last10.reduce((s, b) => s + b.duration, 0) / last10.length;

        console.log(`📊 Last 10 builds avg: ${avgTime.toFixed(2)}ms`);

        if (avgTime > 5000) {
          console.warn("⚠️  Builds are getting slow! Consider optimizing.");
        }
      },
    },
  };
}
```

### Example 3: Type-Safe Configuration

```typescript
import { defineBuildConfig } from "frame-master/build";

export function myPlugin(): FrameMasterPlugin {
  return {
    name: "my-plugin",
    build: {
      // Get full autocomplete and type checking
      buildConfig: defineBuildConfig({
        target: "browser",
        external: ["react", "react-dom"],
        minify: process.env.NODE_ENV === "production",
        define: {
          __VERSION__: JSON.stringify(process.env.VERSION || "1.0.0"),
        },
      }),
    },
  };
}
```

## Conclusion

These improvements significantly enhance Frame-Master's developer experience while maintaining its core philosophy of being a zero-opinion plugin runtime. The additions are backward compatible, well-documented, and provide practical utilities that plugin developers need.
