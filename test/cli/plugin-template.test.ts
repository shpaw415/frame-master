import { describe, test, expect } from "bun:test";
import { join } from "path";
import { formatTemplateFile } from "../../bin/plugin";

/**
 * Plugin Template Replacement Tests
 *
 * Tests that all template variables are correctly replaced when creating a new plugin.
 */

describe("Plugin Template Replacements", () => {
  const PLUGIN_NAME = "my-custom-plugin";
  const CLEAN_PLUGIN_NAME = "mycustomplugin"; // dashes removed

  describe("formatTemplateFile", () => {
    test("should replace ${name} with plugin name", () => {
      const template = "# ${name}\n\nPlugin: ${name}";
      const result = formatTemplateFile(template, PLUGIN_NAME);

      expect(result).toBe(`# ${PLUGIN_NAME}\n\nPlugin: ${PLUGIN_NAME}`);
      expect(result).not.toContain("${name}");
    });

    test("should replace __CleanPluginName__ with plugin name without dashes", () => {
      const template =
        "import __CleanPluginName__ from 'package';\n__CleanPluginName__()";
      const result = formatTemplateFile(template, PLUGIN_NAME);

      expect(result).toBe(
        `import ${CLEAN_PLUGIN_NAME} from 'package';\n${CLEAN_PLUGIN_NAME}()`
      );
      expect(result).not.toContain("__CleanPluginName__");
    });

    test("should replace __PluginName__ with plugin name", () => {
      const template = 'bun add __PluginName__\nimport x from "__PluginName__"';
      const result = formatTemplateFile(template, PLUGIN_NAME);

      expect(result).toBe(
        `bun add ${PLUGIN_NAME}\nimport x from "${PLUGIN_NAME}"`
      );
      expect(result).not.toContain("__PluginName__");
    });

    test("should handle all replacements together", () => {
      const template = `# \${name}

bun add __PluginName__

import __CleanPluginName__ from "__PluginName__";

plugins: [__CleanPluginName__()]`;

      const result = formatTemplateFile(template, PLUGIN_NAME);

      expect(result).toBe(`# ${PLUGIN_NAME}

bun add ${PLUGIN_NAME}

import ${CLEAN_PLUGIN_NAME} from "${PLUGIN_NAME}";

plugins: [${CLEAN_PLUGIN_NAME}()]`);

      // Ensure no template variables remain
      expect(result).not.toContain("${name}");
      expect(result).not.toContain("__PluginName__");
      expect(result).not.toContain("__CleanPluginName__");
    });

    test("should handle plugin names without dashes", () => {
      const simpleName = "myplugin";
      const template = "__CleanPluginName__ and __PluginName__";
      const result = formatTemplateFile(template, simpleName);

      // Both should be the same when there are no dashes
      expect(result).toBe(`${simpleName} and ${simpleName}`);
    });

    test("should handle plugin names with multiple dashes", () => {
      const multiDashName = "frame-master-plugin-react-ssr";
      const cleanName = "framemasterpluginreactssr";
      const template =
        "Name: ${name}, Clean: __CleanPluginName__, Package: __PluginName__";
      const result = formatTemplateFile(template, multiDashName);

      expect(result).toBe(
        `Name: ${multiDashName}, Clean: ${cleanName}, Package: ${multiDashName}`
      );
    });
  });

  describe("README.template.md integration", () => {
    test("should correctly transform README template", async () => {
      const templatePath = join(
        __dirname,
        "..",
        "..",
        "bin",
        "plugin",
        "README.template.md"
      );
      const template = await Bun.file(templatePath).text();
      const result = formatTemplateFile(template, PLUGIN_NAME);

      // Check header
      expect(result).toContain(`# ${PLUGIN_NAME}`);

      // Check installation command
      expect(result).toContain(`bun add ${PLUGIN_NAME}`);

      // Check import statement
      expect(result).toContain(
        `import ${CLEAN_PLUGIN_NAME} from "${PLUGIN_NAME}"`
      );

      // Check plugin usage
      expect(result).toContain(`plugins: [${CLEAN_PLUGIN_NAME}()]`);

      // Ensure no template variables remain
      expect(result).not.toContain("${name}");
      expect(result).not.toContain("__PluginName__");
      expect(result).not.toContain("__CleanPluginName__");
    });
  });

  describe("plugin-template.ts integration", () => {
    test("should correctly transform plugin template", async () => {
      const templatePath = join(
        __dirname,
        "..",
        "..",
        "bin",
        "plugin",
        "plugin-template.ts"
      );
      const template = await Bun.file(templatePath).text();
      const result = formatTemplateFile(template, PLUGIN_NAME);

      // Ensure no template variables remain
      expect(result).not.toContain("${name}");
      expect(result).not.toContain("__PluginName__");
      expect(result).not.toContain("__CleanPluginName__");
    });
  });
});
