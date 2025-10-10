import type { FrameMasterConfig } from "./type";
import { join } from "path";

const config = (await import(join(process.cwd(), "config", "config.ts"))).default as FrameMasterConfig;


export default config;