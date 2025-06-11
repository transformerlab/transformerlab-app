// Re-declare SegmentContext here to avoid import cycle
import { createContext, useContext } from 'react';

export const SegmentContext = createContext<any>(null);

// Proxy-based analytics hook (no cycle):
export const useAnalytics = () => {
  const analytics = useContext(SegmentContext) as any;

  // Proxy that checks the latest DO_NOT_TRACK and environment on every call
  const analyticsProxy = new Proxy(
    {},
    {
      get: (_, prop) => {
        // Return a function that checks the flags before calling analytics
        return async (...args: any[]) => {
          // @ts-ignore
          if (window.platform?.environment === 'development') return undefined;
          // @ts-ignore
          const doNotTrack = await window.storage.get('DO_NOT_TRACK');
          if (doNotTrack === 'true') return undefined;
          if (typeof analytics[prop] === 'function') {
            return (analytics[prop] as Function)(...args);
          }
          return undefined;
        };
      },
    },
  );

  return analyticsProxy;
};
