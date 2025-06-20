/* eslint-disable import/prefer-default-export */
// src/analytics/appContextPlugin.js

/**
 * A function that retrieves the common app context.
 * It's good practice to have this logic in a separate function.
 */
const getAppContext = () => ({
  app: {
    version: window.platform?.version,
    mode: window.platform?.appmode,
  },
});

/**
 * This function enriches an event's context with our common app data.
 * @param {object} ctx The event context from Segment.
 * @returns The modified event context.
 */
const enrichContext = (ctx) => {
  console.log('[Analytics] enrichContext called', ctx);
  // Merge our app context with any context that might already exist.
  // The '?? {}' ensures we don't crash if ctx.event.context is null or undefined.
  ctx.event.context = {
    ...(ctx.event.context ?? {}),
    ...getAppContext(),
  };

  // Return the modified context to allow the event to continue.
  return ctx;
};

export const appContextPlugin = {
  name: 'App Context Enrichment',
  type: 'enrichment',
  version: '1.0.0',

  isLoaded: () => true,
  load: () => Promise.resolve(),

  // Apply the enrichment to all relevant event types
  track: enrichContext,
  page: enrichContext,
  identify: enrichContext, // Good practice to add context to identify calls too
  group: enrichContext,
  alias: enrichContext,
};
