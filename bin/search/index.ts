import { Command } from "commander";
import PluginSearchCommand from "./plugin";
import TemplateSearchCommand from "./template";

export const searchCommand = new Command("search");

searchCommand
  .description("Search for Frame-Master plugins and templates")
  .addHelpText(
    "after",
    `
Examples:
  $ frame-master search plugins react
  $ frame-master search plugins "server side rendering"
  $ frame-master search plugins name:react-ssr
  $ frame-master search templates react
  $ frame-master search templates --category starter --limit 10

Advanced Query Syntax:
  "exact phrase"    Search for exact phrase match
  -term             Exclude results containing term
  name:value        Filter by plugin/template name
  tag:value         Filter by tag
  author:value      Filter by author
  npm:value         Filter by npm package name
  category:value    Filter by category
`
  );

searchCommand.addCommand(PluginSearchCommand);
searchCommand.addCommand(TemplateSearchCommand);

export default searchCommand;
