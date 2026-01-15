import React, { createContext, useContext, useMemo, useEffect, useRef } from 'react';
import { useSWRWithAuth as useSWR } from './authContext';
import { API_URL } from './api-client/urls';
import { fetcher } from './api-client/hooks';

interface ServerModeContextValue {
  mode: string | null;
  isLocalMode: boolean;
  healthzData: any;
  isLoading: boolean;
  isError: any;
  mutate: () => Promise<any>; // Expose mutate for manual refresh
}

const ServerModeContext = createContext<ServerModeContextValue | undefined>(
  undefined,
);

export function ServerModeProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const api_url = API_URL();
  const healthzUrl: string | null = api_url ? api_url + 'healthz' : null;

  const {
    data: healthzData,
    isError,
    isLoading,
    mutate,
  } = useSWR(healthzUrl, fetcher, {
    refreshInterval: 10000, // Check mode every 10 seconds
    revalidateOnFocus: true, // Revalidate when window regains focus
    revalidateOnReconnect: true, // Revalidate when network reconnects
    shouldRetryOnError: true, // Retry on error (e.g., when API is restarting)
    errorRetryInterval: 2000, // Retry every 2 seconds on error
  });

  const mode = healthzData?.mode ? String(healthzData.mode).trim() : null;
  const isLocalMode = mode === 'local';
  
  // Track previous error state to detect when API comes back online
  const prevErrorRef = useRef(isError);
  
  // When error clears (API comes back online), force a refresh
  useEffect(() => {
    if (prevErrorRef.current && !isError && !isLoading) {
      // API was down but is now back online, force refresh
      mutate();
    }
    prevErrorRef.current = isError;
  }, [isError, isLoading, mutate]);

  const contextValue = useMemo(
    () => ({
      mode,
      isLocalMode,
      healthzData,
      isLoading,
      isError,
      mutate,
    }),
    [mode, isLocalMode, healthzData, isLoading, isError, mutate],
  );

  return (
    <ServerModeContext.Provider value={contextValue}>
      {children}
    </ServerModeContext.Provider>
  );
}

/**
 * Custom hook to access server mode context.
 * @returns {{
 *   mode: string | null,
 *   isLocalMode: boolean,
 *   healthzData: any,
 *   isLoading: boolean,
 *   isError: any,
 *   mutate: () => Promise<any>
 * }}
 */
export function useServerMode(): ServerModeContextValue {
  const context = useContext(ServerModeContext);
  if (context === undefined) {
    throw new Error('useServerMode must be used within a ServerModeProvider');
  }
  return context;
}
