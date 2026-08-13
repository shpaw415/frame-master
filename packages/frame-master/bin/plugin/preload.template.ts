import { loadRuntimePluginFromPlugins } from "frame-master/testing";
import plugin from "../index";

await loadRuntimePluginFromPlugins([plugin()]);
