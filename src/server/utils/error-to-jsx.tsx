import type { JSX } from "react";

/**
 * Options for customizing error JSX output
 */
interface ErrorToJSXOptions {
  /** Whether to include the full stack trace (default: true in development) */
  includeStack?: boolean;
  /** Whether to include error cause chain (default: true) */
  includeCause?: boolean;
  /** Whether to include timestamp (default: true) */
  includeTimestamp?: boolean;
  /** Custom CSS class name prefix (default: 'error') */
  classPrefix?: string;
  /** Additional CSS classes to add to container */
  className?: string;
}

interface ErrorDetails {
  name: string;
  message: string;
  stack?: string;
  cause?: any;
  timestamp: string;
  [key: string]: any;
}

const DEFAULT_OPTIONS: Required<Omit<ErrorToJSXOptions, "className">> = {
  includeStack: true,
  includeCause: true,
  includeTimestamp: true,
  classPrefix: "error",
};

/**
 * Extracts detailed information from an error object
 * @param error - The error to extract details from
 * @returns Structured error details object
 */
function extractErrorDetails(error: Error | any): ErrorDetails {
  const details: ErrorDetails = {
    name: error.name || "Error",
    message: error.message || String(error),
    timestamp: new Date().toISOString(),
  };

  // Extract stack trace if available
  if (error.stack) {
    details.stack = error.stack;
  }

  // Extract cause chain if available
  if (error.cause) {
    details.cause = error.cause;
  }

  // Include any additional properties
  for (const key in error) {
    if (
      error.hasOwnProperty(key) &&
      !["name", "message", "stack", "cause"].includes(key)
    ) {
      details[key] = error[key];
    }
  }

  return details;
}

/**
 * Formats a stack trace into JSX list items
 * @param stack - Stack trace string
 * @param classPrefix - CSS class prefix
 * @returns Array of JSX list items
 */
function formatStackTrace(stack: string, classPrefix: string) {
  const lines = stack.split("\n").slice(1); // Skip first line (error message)

  return lines
    .filter((line) => line.trim())
    .map((line, index) => {
      const trimmed = line.trim();
      return (
        <li key={index} className={`${classPrefix}-stack-item`}>
          {trimmed}
        </li>
      );
    });
}

/**
 * Formats error cause chain recursively
 * @param cause - The cause error
 * @param classPrefix - CSS class prefix
 * @param depth - Current recursion depth
 * @returns JSX element of formatted cause chain
 */
function formatCauseChain(
  cause: any,
  classPrefix: string,
  depth: number = 0
): JSX.Element | null {
  if (!cause || depth > 10) return null; // Prevent infinite recursion

  const causeName = cause.name || "Error";
  const causeMessage = cause.message || String(cause);

  return (
    <div className={`${classPrefix}-cause`} data-depth={depth}>
      <div className={`${classPrefix}-cause-header`}>
        <span className={`${classPrefix}-cause-label`}>Caused by:</span>
        <span className={`${classPrefix}-cause-name`}>{causeName}</span>
      </div>
      <div className={`${classPrefix}-cause-message`}>{causeMessage}</div>
      {cause.cause && formatCauseChain(cause.cause, classPrefix, depth + 1)}
    </div>
  );
}

/**
 * Formats additional error properties into JSX
 * @param details - Error details object
 * @param classPrefix - CSS class prefix
 * @returns JSX element of additional properties or null
 */
function formatAdditionalProperties(
  details: ErrorDetails,
  classPrefix: string
): JSX.Element | null {
  const additionalProps = Object.entries(details).filter(
    ([key]) => !["name", "message", "stack", "cause", "timestamp"].includes(key)
  );

  if (additionalProps.length === 0) return null;

  return (
    <div className={`${classPrefix}-additional`}>
      <div className={`${classPrefix}-additional-header`}>
        Additional Information
      </div>
      {additionalProps.map(([key, value]) => {
        const formattedValue =
          typeof value === "object"
            ? JSON.stringify(value, null, 2)
            : String(value);

        return (
          <div key={key} className={`${classPrefix}-property`}>
            <span className={`${classPrefix}-property-key`}>{key}:</span>
            <span className={`${classPrefix}-property-value`}>
              {formattedValue}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/**
 * Converts an error object into a formatted JSX element with proper styling classes.
 *
 * This function takes any error object and generates a comprehensive JSX representation
 * that includes:
 * - Error name and message
 * - Stack trace (optional)
 * - Cause chain (optional, follows error.cause recursively)
 * - Timestamp
 * - Additional error properties
 *
 * The generated JSX uses semantic class names for styling via external CSS.
 *
 * @param error - Error object or any value to format as error
 * @param options - Customization options for the JSX output
 * @returns JSX.Element representing the error
 *
 * @example
 * ```tsx
 * const error = new Error('Database connection failed');
 * error.cause = new Error('Network timeout');
 *
 * const ErrorComponent = () => {
 *   return <div>{errorToJSX(error)}</div>;
 * };
 * ```
 *
 * @example
 * ```tsx
 * // With custom options
 * const errorElement = errorToJSX(error, {
 *   includeStack: false,
 *   classPrefix: 'app-error',
 *   className: 'my-custom-class'
 * });
 * ```
 *
 * @example
 * ```tsx
 * // Production mode (minimal details)
 * const errorElement = errorToJSX(error, {
 *   includeStack: false,
 *   includeCause: false,
 *   includeTimestamp: false
 * });
 * ```
 */
export function errorToJSX(
  error: Error | any,
  options: ErrorToJSXOptions = {}
): JSX.Element {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const details = extractErrorDetails(error);
  const prefix = opts.classPrefix;
  const containerClass = options.className
    ? `${prefix}-container ${options.className}`
    : `${prefix}-container`;

  const formattedTime = new Date(details.timestamp).toLocaleString();

  return (
    <div className={containerClass} role="alert" aria-live="polite">
      <div className={`${prefix}-header`}>
        <span className={`${prefix}-icon`} aria-hidden="true">
          ⚠️
        </span>
        <h2 className={`${prefix}-title`}>{details.name}</h2>
      </div>

      <div className={`${prefix}-body`}>
        <div className={`${prefix}-message`}>{details.message}</div>

        {opts.includeTimestamp && (
          <div className={`${prefix}-timestamp`}>
            <span className={`${prefix}-timestamp-label`}>Time:</span>
            <time dateTime={details.timestamp}>{formattedTime}</time>
          </div>
        )}

        {opts.includeStack && details.stack && (
          <details className={`${prefix}-stack-details`}>
            <summary className={`${prefix}-stack-summary`}>Stack Trace</summary>
            <ul className={`${prefix}-stack-list`}>
              {formatStackTrace(details.stack, prefix)}
            </ul>
          </details>
        )}

        {opts.includeCause &&
          details.cause &&
          formatCauseChain(details.cause, prefix)}

        {formatAdditionalProperties(details, prefix)}
      </div>
    </div>
  );
}

/**
 * Creates a complete HTML error page as JSX with the error component
 * @param error - Error object to display
 * @param options - Error formatting options
 * @param cssPath - Path to the error CSS file (default: '/error-styles.css')
 * @returns Complete HTML page as JSX.Element
 */
export function errorToJSXPage(
  error: Error | any,
  options: ErrorToJSXOptions = {},
  cssPath: string = "/frame-master-error.css"
): JSX.Element {
  const title = error.name || "Error";

  return (
    <html lang="en">
      <head>
        <meta charSet="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>{title}</title>
        <link rel="stylesheet" href={cssPath} />
      </head>
      <body>{errorToJSX(error, options)}</body>
    </html>
  );
}
