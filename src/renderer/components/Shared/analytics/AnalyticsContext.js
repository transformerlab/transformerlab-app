/* eslint-disable no-console */
// src/analytics/AnalyticsContext.js
import { createContext, useContext } from 'react';
import { AnalyticsBrowser } from '@segment/analytics-next';
import { appContextPlugin } from './appContextPlugin'; // Import the app context plugin

// Initialize the Segment client
export const analytics = new AnalyticsBrowser();

async function maybeLoadAnalytics() {
  if (window.platform?.environment === 'development') {
    console.log('Analytics tracking is disabled in development mode.');
    return;
  }
  const doNotTrack = await window.storage.get('DO_NOT_TRACK');
  if (doNotTrack) {
    console.log('User has opted out. All Segment tracking is disabled.');
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

// Export a provider component
export const AnalyticsProvider = ({ children }) => {
  return (
    <AnalyticsContext.Provider value={analytics}>
      {children}
    </AnalyticsContext.Provider>
  );
};
