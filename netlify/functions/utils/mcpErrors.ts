/** Raised by tool handlers for caller mistakes; surfaced as an `isError` tool result, not a protocol error. */
export class ToolInputError extends Error {}
