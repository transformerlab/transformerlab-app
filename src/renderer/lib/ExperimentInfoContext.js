// src/contexts/ExperimentInfoContext.js
import React, {
  createContext,
  useContext,
  useMemo,
  useState,
  useEffect,
} from 'react'; // Import useMemo
import useSWR from 'swr';

import * as chatAPI from './transformerlab-api-sdk.ts'; // Adjust the import path as necessary

const fetcher = (url) => fetch(url).then((res) => res.json());

const ExperimentInfoContext = createContext(undefined);

export function ExperimentInfoProvider({ connection, children }) {
  const [experimentId, setExperimentId] = useState(null);

  // Load experimentId from storage or default
  useEffect(() => {
    async function getSavedExperimentId() {
      const connectionWithoutDots = connection
        ? connection.replace(/\./g, '-')
        : '';
      const storedExperimentId = window.storage
        ? await window.storage.get(`experimentId.${connectionWithoutDots}`)
        : null;
      if (storedExperimentId) {
        setExperimentId(Number(storedExperimentId));
      } else if (connection && connection !== '') {
        setExperimentId(1);
      } else {
        setExperimentId(null);
      }
    }
    if (connection === '' || !connection) {
      setExperimentId(null);
      return;
    }
    getSavedExperimentId();
  }, [connection]);

  // Persist experimentId to storage
  useEffect(() => {
    if (experimentId === null || !window.storage || !connection) return;
    const connectionWithoutDots = connection.replace(/\./g, '-');
    window.storage.set(`experimentId.${connectionWithoutDots}`, experimentId);
  }, [experimentId, connection]);

  const {
    data: experimentInfo,
    error: experimentInfoError,
    isLoading: experimentInfoIsLoading,
    mutate: experimentInfoMutate,
  } = useSWR(
    experimentId ? chatAPI.Endpoints.Experiment.Get(experimentId) : null,
    fetcher,
  );

  // Use useMemo to memoize the contextValue object
  const contextValue = useMemo(() => {
    return {
      experimentId,
      setExperimentId,
      experimentInfo,
      experimentInfoError,
      experimentInfoIsLoading,
      experimentInfoMutate,
    };
  }, [
    experimentId,
    setExperimentId,
    experimentInfo,
    experimentInfoError,
    experimentInfoIsLoading,
    experimentInfoMutate,
  ]);
  // Dependencies: Re-create contextValue ONLY if these values change

  return (
    <ExperimentInfoContext.Provider value={contextValue}>
      {children}
    </ExperimentInfoContext.Provider>
  );
}

/**
 * Custom hook to access experiment info context.
 * @returns {{
 *   experimentId: number | null,
 *   setExperimentId: React.Dispatch<React.SetStateAction<number | null>>,
 *   experimentInfo: any,
 *   experimentInfoError: any,
 *   experimentInfoIsLoading: boolean,
 *   experimentInfoMutate: (...args: any[]) => Promise<any>
 * }}
 */
export function useExperimentInfo() {
  const context = useContext(ExperimentInfoContext);

  if (context === undefined) {
    throw new Error(
      'useExperimentInfo must be used within an ExperimentInfoProvider',
    );
  }

  return context;
}
