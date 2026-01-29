/* eslint-disable no-console */
// src/analytics/AnalyticsContext.js
import { createContext, useContext } from 'react';
import { AnalyticsBrowser } from '@segment/analytics-next';
import { appContextPlugin } from './appContextPlugin'; // Import the app context plugin

// Initialize the Segment client
export const analytics = new AnalyticsBrowser();

async function maybeLoadAnalytics() {
  console.log('[Analytics] Initializing Analytics...');
  if (window.platform?.environment === 'development') {
    console.log(
      '[Analytics] Analytics tracking is disabled in development mode.',
    );
    return;
  }
  const doNotTrack = await window.storage.get('DO_NOT_TRACK');
  console.log(`[Analytics] Do Not Track setting: ${doNotTrack}`);
  // If the user has opted out of tracking, do not load the analytics client
  if (doNotTrack === 'true') {
    console.log(
      '[Analytics] User has opted out. All usage tracking is disabled.',
    );
    return;
  }
  analytics.load({ writeKey: 'UYXFr71CWmsdxDqki5oFXIs2PSR5XGCE' }); // destinations loaded, enqueued events are flushed
}

maybeLoadAnalytics();

analytics.register(appContextPlugin); // Register the plugins

// Create a React Context
const AnalyticsContext = createContext(analytics);

// Export a custom hook for easy access to the analytics instance
export const useAnalytics = () => {
  return useContext(AnalyticsContext);
};

// Identify a user for tracking purposes
export const identifyUser = (userId, traits = {}) => {
  if (!userId) {
    console.warn('[Analytics] identifyUser called without userId');
    return;
  }
  console.log('[Analytics] Identifying user:', userId);
  analytics.identify(userId, traits);
};

// Reset user identity (call on logout)
export const resetUser = () => {
  console.log('[Analytics] Resetting user identity');
  analytics.reset();
};

// Export a provider component
export const AnalyticsProvider = ({ children }) => {
  return (
    <AnalyticsContext.Provider value={analytics}>
      {children}
    </AnalyticsContext.Provider>
  );
};
