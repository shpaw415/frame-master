import { drizzle } from "drizzle-orm/d1";
import * as schema from "./schema";

/**
 * Initialize Drizzle ORM with D1 database
 * Use this in your Cloudflare Pages Functions
 *
 * @example
 * ```ts
 * // In a Cloudflare Pages Function
 * export const onRequest: PagesFunction<Env> = async (context) => {
 *   const db = getDb(context.env.DB);
 *   const allPlugins = await db.select().from(schema.plugins);
 *   return Response.json(allPlugins);
 * };
 * ```
 */
export function getDb(d1: D1Database) {
  return drizzle(d1, { schema });
}

export { schema };
