"server only";

import {
  webToken,
  type _webToken,
  type SetDataOptions,
} from "@shpaw415/webtoken";
import { formatHTML } from "./utils/html-formating";
import { directiveToolSingleton, type Directives } from "../plugins/utils";
import { join, resolve } from "path";
import { pluginLoader } from "../plugins/plugin-loader";
import type { BodyInit, HeadersInit, MatchedRoute } from "bun";
import { FrameMasterError } from "./error";
import {
  renderToReadableStream,
  renderToString,
  type ReactDOMServerReadableStream,
} from "react-dom/server";
import type { FrameMasterConfig, Params } from "./type";
import { errorToJSXPage } from "./utils/error-to-jsx";
import NotFound from "@/server/fallback/not-found";
import ServerConfig from "./config";

export type CookieOptions = Omit<_webToken, "cookieName"> & {
  encrypted?: boolean;
};

export type DeleteCookieOptions = {
  path?: string;
  domain?: string;
  secure?: boolean;
  sameSite?: "Lax" | "Strict" | "None";
  httpOnly?: boolean;
};

const HTML_DOCTYPE = "<!DOCTYPE html>";

class CookieError extends FrameMasterError {}
export class ResponseAlreadySetError extends FrameMasterError {}
export class ResponseNotSetError extends FrameMasterError {}
export class NoServerSideMatchError extends FrameMasterError {}

const CURRENT_PATH = process.cwd();

export type RequestState = "before_request" | "request" | "after_request";

export type RequestMatch = {
  pathname: string;
  route: string;
  filePaths: { build?: string; src: string };
  params: Record<string, string | string[]> | undefined;
  directive: Directives;
};

export type GlobalDataInjectionType = {
  data: Record<string, string>;
  rawData: Record<string, unknown>;
};

type Writable<T> = {
  -readonly [P in keyof T]: T[P];
};

export class masterRequest<ContextType extends Record<string, unknown> = {}> {
  public request: Request;

  public currentState: RequestState = "before_request";

  private _response?: Response;

  private _response_setted: boolean = false;
  private _response_body: BodyInit | null = null;
  private _response_init: Writable<ResponseInit> = {};

  public isSendNowEnabled: boolean = false;

  public __ERROR__?: Error;

  private _awaitingCookies: Array<{
    name: string;
    data: any;
    options?: CookieOptions;
    dataOptions?: SetDataOptions;
  }> = [];
  private _awaitingCookieDeletion: Array<{
    name: string;
    options?: DeleteCookieOptions;
  }> = [];

  private _cookieCache: Map<string, Record<string, unknown>> = new Map();

  /**
   * Indicates if the request is asking for HTML.
   *
   * normally the first HTML load
   */
  public readonly isAskingHTML: boolean;
  /**
   * Matching values applied when it is a client-side navigation or a first request to a route.
   */
  public readonly match?: RequestMatch;

  public readonly directivesTools = directiveToolSingleton;

  /**
   * Indicates if the request is for a static asset.
   *
   * From the Build dir or the Static dir
   */
  public isStaticAsset: boolean = false;

  public globalDataInjection: GlobalDataInjectionType = {
    data: {},
    rawData: {},
  };
  private _prevent_global_values_injection: boolean = false;
  private _prevent_rewrite: boolean = false;
  /**
   * transport Request specific data for plugins
   */
  public context: ContextType = {} as ContextType;
  public URL: URL;

  public router: {
    server: any;
    client: any;
  } = {
    server: "",
    client: "",
  };
  /**
   * Server configuration
   */
  public serverConfig: FrameMasterConfig = ServerConfig;
  public serverInstance: Bun.Server<undefined>;

  constructor(props: { request: Request; server: Bun.Server<undefined> }) {
    this.request = props.request;
    this.serverInstance = props.server;

    this.URL = new URL(this.request.url);

    this.isAskingHTML = Boolean(
      this.request.headers.get("accept")?.includes("text/html")
    );
    /*
        this.match = this.initMatch();
        */
  }

  async handleRequest(): Promise<Response> {
    const routerPlugins = pluginLoader.getPluginByName("router");

    this.currentState = "before_request";

    for await (const { pluginParent, name } of routerPlugins) {
      try {
        await pluginParent.before_request?.(this);
      } catch (e) {
        console.error(`Error in router plugin, name: ${name}:`);
        console.error(e);
        return this.sendErrorResponse(e);
      }
    }

    this.currentState = "request";

    for await (const { pluginParent, name } of routerPlugins) {
      try {
        await pluginParent.request?.(this);
      } catch (e) {
        console.error(`Error in router plugin, name: ${name}:`);
        console.error(e);
        return this.sendErrorResponse(e);
      }
      if (this.isSendNowEnabled) break;
    }

    this.currentState = "after_request";

    for await (const { pluginParent, name } of routerPlugins) {
      try {
        await pluginParent.after_request?.(this);
      } catch (e) {
        console.error(`Error in router plugin, name: ${name}:`);
        console.error(e);
        return this.sendErrorResponse(e);
      }
    }

    await this._formatResponseBeforeSending();
    return this._response!;
  }

  private sendErrorResponse(error: unknown): Response {
    return new Response(renderToString(errorToJSXPage(error)), {
      status: 500,
      headers: { "Content-Type": "text/html" },
    });
  }

  /*
    private initMatch(): RequestMatch | undefined {
        if (this.isClientNavigating) {
            const pathname = this.URL.searchParams.get("__FrameMaster_PATHNAME__");
            if (!pathname) throw new NoServerSideMatchError(`missing matching information for __FrameMaster_PATHNAME__`);
            const matchServer = this.router.server.match(pathname);
            const matchClient = this.router.client.match(pathname) || process.env.NODE_ENV === "development";
            if (!matchServer || !matchClient) throw new NoServerSideMatchError(`no matching route found for __FrameMaster_PATHNAME__`);


            const directive = this.directivesTools.getDirectiveFromFilePath(matchServer.filePath) as Directives;
            return {
                pathname: matchServer.pathname,
                route: matchServer.name,
                filePaths: {
                    build: this.sanitizePath("." + pathname, join(CURRENT_PATH, this.manager.router.buildDir)),
                    src: this.sanitizePath("." + pathname, join(CURRENT_PATH, this.manager.router.pageDir)),
                },
                params: this.formatParams(matchServer.params),
                directive
            };
        } else if (this.isAskingHTML && this.manager.serverSide) {
            const directive = this.directivesTools.getDirectiveFromFilePath(this.manager.serverSide.filePath) as Directives;
            return {
                pathname: this.manager.serverSide.pathname,
                route: this.manager.serverSide.name,
                filePaths: {
                    build: this.manager.clientSide?.filePath,
                    src: this.manager.serverSide.filePath
                },
                params: this.formatParams(this.manager.serverSide.params) as Record<string, string | string[]>,
                directive
            };
        } else return undefined;
    }
    */

  formatParams(match: MatchedRoute["params"] | undefined): Params {
    if (!match) return {};
    const params =
      Object.entries(match).map(([key, value]) => {
        const val = value.split("/");
        if (val.length > 1) {
          return [key, val];
        }
        return [key, val[0]];
      }) || [];

    return Object.fromEntries(params);
  }

  private sanitizePath(unsafePath: string, basePath: string) {
    const resolvedPath = resolve(basePath, unsafePath);
    if (!resolvedPath.startsWith(basePath)) {
      throw new Error("Access to path is not allowed.");
    }
    return resolvedPath;
  }

  /**
   * Skip all other plugins, apply modifiers and send the response
   */
  sendNow() {
    this._ensureisInState(
      ["request"],
      "You can only send the response in the request state."
    );
    this._ensureResponseIsSet(
      "You can only trigger sendNow if the response is set."
    );
    this.isSendNowEnabled = true;
  }
  /**
   * Gets the context for the request.
   * @returns The context for the request.
   */
  getContext<
    CutsomContextType extends unknown = undefined
  >(): CutsomContextType extends undefined ? ContextType : CutsomContextType {
    return this.context as any;
  }
  /**
   * Sets the context data for the request.
   * @param context The context to set for the request. will merge with existing context
   */
  setContext<CutsomContextType extends unknown = undefined>(
    context: CutsomContextType extends undefined
      ? ContextType
      : CutsomContextType
  ) {
    this.context = { ...this.context, ...(context as any) };
    return context;
  }
  public get response(): Response | undefined {
    return this._response;
  }
  /**
   * Sets the response object. For Plugins.
   * @param response The response object.
   * @returns The current instance for chaining.
   */
  setResponse(body: BodyInit | null, init?: ResponseInit): this {
    this._ensureisInState(
      ["request"],
      "You can only set the response in the request state."
    );
    if (this._response_setted)
      throw new ResponseAlreadySetError("Response already set");
    this._response_body = body;
    this._response_init = {
      ...this._response_init,
      headers: {
        ...this._response_init?.headers,
        ...init?.headers,
      },
    };
    this._response_setted = true;
    return this;
  }
  /**
   * Checks if the response has been set.
   * @returns True if the response has been set, false otherwise.
   */
  isResponseSetted(): boolean {
    return this._response_setted;
  }
  unsetResponse(): void {
    this._ensureisInState(
      ["request"],
      "You can only unset the response in the request state."
    );
    this._response_setted = false;
    this._response_body = null;
  }

  private _setCookie<T extends Record<string, unknown>>(
    name: string,
    data: T,
    options?: CookieOptions,
    dataOptions?: SetDataOptions
  ) {
    this._ensureResponseIsSet("error when setting cookie");
    const { encrypted, ...wtOptions } = options || {};
    const wt = new webToken(this.request, { ...wtOptions, cookieName: name });
    if (encrypted) {
      wt.setData(data, dataOptions);
      wt.setCookie(this._response as Response);
    } else {
      wt.setPlainJsonCookie(this._response as Response, name, data, wtOptions);
    }
    return this;
  }
  /**
   * Sets a cookie for the response.
   * @param name The name of the cookie.
   * @param data The data to store in the cookie.
   * @param options Options for the cookie.
   */
  setCookie<T extends Record<string, unknown>>(
    name: string,
    data: T,
    options?: CookieOptions,
    dataOptions?: SetDataOptions
  ) {
    if (this.isResponseSetted())
      return this._setCookie(name, data, options, dataOptions);
    this._awaitingCookies.push({ name, data, options, dataOptions });
    return this;
  }
  /**
   * Gets a cookie from the request as an object.
   * @param name The name of the cookie.
   * @param encrypted Whether the cookie is encrypted.
   * @returns The cookie data or undefined if not found.
   */
  getCookie<_Data extends Record<string, unknown>>(
    name: string,
    encrypted: boolean = false
  ): _Data | undefined {
    if (this._cookieCache.has(name)) {
      return this._cookieCache.get(name) as _Data;
    }
    const wt = new webToken<_Data>(this.request, { cookieName: name });
    const res = encrypted ? wt.session() : wt.getPlainJsonCookie(name);

    this._cookieCache.set(name, res || {});

    return res;
  }
  private _deleteCookie(name: string, options?: DeleteCookieOptions) {
    this._ensureResponseIsSet("error when deleting cookie");
    const opts = options || {};
    const parts = [`${name}=`, `path=${opts.path || "/"}`];
    if (opts.domain) parts.push(`domain=${opts.domain}`);
    parts.push("expires=Thu, 01 Jan 1970 00:00:00 GMT");
    if (opts.secure) parts.push("secure");
    if (opts.httpOnly) parts.push("httponly");
    parts.push(`samesite=${opts.sameSite || "Lax"}`);
    this._response?.headers.append("Set-Cookie", parts.join("; "));
    return this;
  }
  /**
   * Deletes a cookie from the response.
   * @param name The name of the cookie.
   * @param options Options for deleting the cookie.
   * @returns The current instance for chaining.
   */
  deleteCookie(name: string, options?: DeleteCookieOptions) {
    if (this.isResponseSetted()) return this._deleteCookie(name, options);
    this._awaitingCookieDeletion.push({ name, options });
    return this;
  }
  public _triggerAwaitingCookies() {
    for (const cookie of this._awaitingCookies) {
      this._setCookie(
        cookie.name,
        cookie.data,
        cookie.options,
        cookie.dataOptions
      );
    }
    for (const cookie of this._awaitingCookieDeletion) {
      this._deleteCookie(cookie.name, cookie.options);
    }
    this._awaitingCookies = [];
    this._awaitingCookieDeletion = [];
  }

  setHeader(name: string, value: string) {
    if (this.currentState == "after_request") {
      this._response?.headers.set(name, value);
      return this;
    }
    this._response_init.headers = {
      ...this._response_init.headers,
      [name]: value,
    };
    return this;
  }

  /**
   * Injects global values into the request. they can be accessed into client-side in the globalThis object.
   * @param values The global values to inject. must be serializable.
   * @example
   * // first declare the global variable
   * declare global {
   *  var __MY_GLOBAL_VALUE__: string | undefined;
   * }
   * // then inject the value
   * req.setGlobalValues({ __MY_GLOBAL_VALUE__: "my value" });
   * // then access it in the client-side
   * console.log(globalThis.__MY_GLOBAL_VALUE__); // "my value"
   * @returns The current instance for chaining.
   * @throws Error if the global values injection is not enabled.
   * @throws Error if the value is not serializable.
   *
   * **Note**: This method can only be used in the `before_request` and `request` plugins.
   *
   * **Note**: If you want to prevent the injection of global values, you can use the `preventGlobalValuesInjection` method.
   */
  setGlobalValues<T extends Partial<typeof globalThis>>(values: T) {
    this._ensureisInState(
      ["before_request", "request"],
      "Global values injection is only available in the before_request and request states."
    );
    for (const [key, val] of Object.entries(values)) {
      try {
        this.globalDataInjection.data[key] =
          typeof val == "undefined" ? "undefined" : JSON.stringify(val);
        this.globalDataInjection.rawData[key] = val;
      } catch (error) {
        console.error(`Failed to serialize value for key "${key}":`, error);
      }
    }
    return this;
  }
  /**
   * Prevent the injection of global values into the request.
   *
   * Prevent unnecessary data exposure, useless server processing or resource corruption.
   * @returns The current instance for chaining.
   * **Note**: This method can only be used in the `before_request` and `request` plugins.
   */
  preventGlobalValuesInjection() {
    this._prevent_global_values_injection = true;
    return this;
  }
  /**
   * Checks if the global values injection is prevented.
   * @returns True if the global values injection is prevented, false otherwise.
   */
  isGlobalValuesInjectionPrevented() {
    return this._prevent_global_values_injection;
  }
  /**
   *
   * @returns The current instance for chaining.
   *
   * Prevent all HTML rewrite plugins from modifying the HTML.
   *
   * **Note**: This method can only be used in the `before_request` and `request` plugins.
   */
  preventRewrite() {
    this._prevent_rewrite = true;
    return this;
  }
  GlobalValueInjectionIsPrevented() {
    return this._prevent_global_values_injection;
  }
  /**
   * **For FrameMaster internal use only**
   *
   * Converts the MasterRequest to a Response object.
   * @returns
   *
   * This method applies all necessary transformations to the response body, including HTML formatting and compression.
   * It also handles any errors that may occur during the process and ensures that a valid Response object is returned.
   *
   * If the response body is a string and the content type is HTML, it will be formatted using the `formatHTML` function.
   * If the client supports gzip encoding and the response body is large enough, it will be compressed before being sent.
   *
   * If any errors occur during the process, a 500 Internal Server Error response will be returned with a plain text message.
   *
   * If an error was previously set on the MasterRequest, an error fallback component will be rendered and returned as the response.
   *
   * This method ensures that the response is only sent once and that all necessary headers are set appropriately.
   */
  public async toResponse(): Promise<Response> {
    if (this.__ERROR__) {
      const error = new FrameMasterError(
        "Error occured during serving",
        this.__ERROR__
      );
      return this.setResponseThenReturn(
        new Response(await renderToReadableStream(errorToJSXPage(error)))
      );
    }

    try {
      if (!this._response_setted) {
        return this.setResponseThenReturn(
          new Response(
            await renderToReadableStream(
              NotFound({ pathname: this.URL.pathname })
            ),
            {
              status: 404,
              headers: { "Content-Type": "text/html" },
            }
          )
        );
      }
      // Handle string responses with potential HTML processing
      if (this._response_body instanceof ReadableStream) {
        const self = this;
        const transformer = new TransformStream({
          async transform(chunk, controller) {
            let text = new TextDecoder().decode(chunk);

            // Exemple : injection d’un script avant </body>
            text = await self.applyModifiers(text);

            controller.enqueue(new TextEncoder().encode(text));
          },
        });
        return this.setResponseThenReturn(
          new Response(
            this._response_body.pipeThrough(transformer),
            this._response_init
          )
        );
      } else if (typeof this._response_body !== "string")
        return this.setResponseThenReturn(
          new Response(this._response_body as any, this._response_init)
        );

      let formattedStringData: string;

      try {
        formattedStringData = await this.applyModifiers(this._response_body);
      } catch (error) {
        console.error("Failed to apply modifiers:", error);
        formattedStringData = this._response_body; // Fallback to original
      }

      // Initialize response init if not set
      if (!this._response_init) {
        this._response_init = { headers: {} };
      }
      if (!this._response_init.headers) {
        this._response_init.headers = {};
      }

      // Safely handle headers (support both Headers object and plain object)
      const headers =
        this._response_init.headers instanceof Headers
          ? this._response_init.headers
          : new Headers(this._response_init.headers);

      const contentType =
        headers.get("Content-Type") || headers.get("content-type");

      // Apply HTML formatting if content type is HTML
      if (contentType?.includes("text/html")) {
        try {
          formattedStringData = formatHTML(formattedStringData);
        } catch (error) {
          console.warn("Failed to format HTML:", error);
          // Continue without formatting
        }
      } else if (!contentType) {
        // Set default content type for non-HTML string responses
        headers.set("Content-Type", "text/plain");
      }

      // Update headers in response init
      this._response_init.headers = headers;

      // Handle compression if client supports it
      const acceptEncoding = this.request.headers.get("accept-encoding");
      const supportsGzip =
        acceptEncoding?.includes("gzip") || acceptEncoding?.includes("*");

      if (supportsGzip && formattedStringData.length > 1024) {
        // Only compress if worth it
        try {
          const compressedData = Bun.gzipSync(formattedStringData);
          headers.set("Content-Encoding", "gzip");
          headers.set("Vary", "Accept-Encoding");

          return this.setResponseThenReturn(
            new Response(compressedData, this._response_init)
          );
        } catch (error) {
          console.warn("Failed to compress response:", error);
          // Fall back to uncompressed
        }
      }

      return this.setResponseThenReturn(
        new Response(formattedStringData, this._response_init)
      );
    } catch (error) {
      console.error("Error in toResponse():", error);
      // Return a basic error response instead of throwing
      return this.setResponseThenReturn(
        new Response("Internal Server Error", {
          status: 500,
          headers: { "Content-Type": "text/plain" },
        })
      );
    }
  }

  public async _formatResponseBeforeSending() {
    await this.toResponse();
    this._triggerAwaitingCookies();
  }

  private setResponseThenReturn(res: Response) {
    this._response = res;
    return this._response;
  }

  /**
   * Apply HTML rewrite plugins on html
   * @param html full page html
   * @returns the transformed html ready to set to a Response
   */
  private async applyRewritePlugins(html: string): Promise<string> {
    if (this._prevent_rewrite) return html;
    const rewriter = new HTMLRewriter();
    const plugins = pluginLoader.getSubPluginsByParentName(
      "router",
      "html_rewrite"
    );
    const afters = (
      await Promise.all(
        plugins.map(async (plugin) => {
          try {
            const context: unknown = plugin.subPlugin.initContext?.(this);
            await plugin.subPlugin.rewrite?.(rewriter, this, context);
            return {
              after: plugin.subPlugin.after,
              context: context,
              name: plugin.name,
            };
          } catch (e) {
            console.error(
              `Error in html_rewrite plugin, name: ${plugin.name}:`,
              e
            );
          }
        })
      )
    ).filter((e) => e !== undefined);

    const transformedText = rewriter.transform(html);

    await Promise.all(
      afters.map(({ context, after, name }) => {
        try {
          return after?.(context, this, transformedText);
        } catch (e) {
          console.error(`Error in html_rewrite plugin, name: ${name}:`, e);
        }
      })
    );

    return [this.isAskingHTML ? HTML_DOCTYPE : "", transformedText].join("\n");
  }
  private async applyGlobalVariables(html: string): Promise<string> {
    if (this._prevent_global_values_injection) return html;
    const preloadScriptObj = await this.makePreLoadObject();
    const preloadSriptsStrList = [
      ...this.preloadToStringArray(preloadScriptObj),
      "process={env: __PROCESS_ENV__};",
    ].join(";");
    const rewriter = new HTMLRewriter();
    rewriter.on("head", {
      element(element) {
        element.append("<script>" + preloadSriptsStrList + "</script>", {
          html: true,
        });
      },
    });
    html = rewriter.transform(html);

    return html;
  }
  /**
   * Applies all modifiers to the HTML **rewrite plugins & global variables**
   * @param html The HTML to modify
   * @returns The modified HTML
   */
  private async applyModifiers(html: string): Promise<string> {
    return await this.applyGlobalVariables(
      await this.applyRewritePlugins(html)
    );
  }

  /**
   * Creates the preload object for client-side hydration
   */
  private async makePreLoadObject(): Promise<
    Partial<Record<keyof typeof globalThis, string>>
  > {
    try {
      return {
        __PROCESS_ENV__: JSON.stringify({
          NODE_ENV: process.env.NODE_ENV,
          ...Object.assign(
            {},
            ...Object.entries(process.env)
              .filter(([key]) => key.startsWith("PUBLIC"))
              .map(([key, value]) => ({ [key]: value }))
          ),
        }),
        ...this.globalDataInjection.data,
      } as Partial<Record<keyof typeof globalThis, string>>;
    } catch (error) {
      console.error("Error creating preload object:", error);
      const message = error instanceof Error ? error.message : String(error);
      throw new FrameMasterError(`Failed to create preload object: ${message}`);
    }
  }
  /**
   * ** **FrameMaster Internal use only** **
   *
   * Converts global data to JS format for script injection
   */
  globalDataToJSFormat() {
    return this.preloadToStringArray(this.globalDataInjection.data as any).join(
      ";"
    );
  }
  /**
   * Converts preload object to string array for script injection
   */
  private preloadToStringArray(
    preload: Partial<Record<keyof typeof globalThis & string, string>>
  ): string[] {
    return Object.entries(preload)
      .map(([key, value]) => `globalThis["${key}"]=${value}`)
      .filter(Boolean);
  }
  private _ensureisInState(state: Array<RequestState>, customMessage?: string) {
    if (!state.includes(this.currentState)) {
      throw new Error(
        `This action is only available in the following states: ${state.join(
          ", "
        )}. Current state: ${this.currentState}. ${customMessage || ""}`
      );
    }
  }
  private _ensureResponseIsSet(customMessage?: string) {
    if (!this._response_setted) {
      throw new ResponseNotSetError(`Response not set: ${customMessage || ""}`);
    }
  }
}
