import * as Sentry from '@sentry/node';
import type { Handler, HandlerEvent, HandlerContext, HandlerResponse } from '@netlify/functions';

const SENTRY_DSN = process.env.SENTRY_DSN;

if (SENTRY_DSN) {
    Sentry.init({
        dsn: SENTRY_DSN,
        environment: process.env.NODE_ENV || 'production',
        tracesSampleRate: 0.2,
    });
}

/**
 * Wraps a Netlify Function handler with Sentry error capturing.
 * Captures unhandled exceptions with request context and user info.
 */
export function withSentry(handler: Handler): Handler {
    return async (event: HandlerEvent, context: HandlerContext): Promise<HandlerResponse> => {
        try {
            return await handler(event, context);
        } catch (error) {
            Sentry.withScope((scope) => {
                scope.setTag('function', event.path);
                scope.setExtra('httpMethod', event.httpMethod);
                scope.setExtra('queryStringParameters', event.queryStringParameters);
                // Don't log full body (may contain sensitive data), just its presence
                scope.setExtra('hasBody', !!event.body);
                Sentry.captureException(error);
            });
            await Sentry.flush(2000);

            return {
                statusCode: 500,
                body: JSON.stringify({ error: 'Internal server error' }),
            };
        }
    };
}

/**
 * Manually capture an error with context (for caught errors inside handlers).
 */
export function captureError(error: unknown, extras?: Record<string, any>) {
    if (!SENTRY_DSN) return;
    Sentry.withScope((scope) => {
        if (extras) {
            for (const [key, value] of Object.entries(extras)) {
                scope.setExtra(key, value);
            }
        }
        Sentry.captureException(error);
    });
}
