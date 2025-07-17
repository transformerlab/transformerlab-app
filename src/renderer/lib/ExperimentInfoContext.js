// src/contexts/ExperimentInfoContext.js
import React, {
  createContext,
  useContext,
  useMemo,
  useState,
  useEffect,
  useCallback,
} from 'react'; // Import useMemo
import useSWR from 'swr';

import * as chatAPI from './transformerlab-api-sdk.ts'; // Adjust the import path as necessary

const fetcher = (url) => fetch(url).then((res) => res.json());

const ExperimentInfoContext = createContext(undefined);

export function ExperimentInfoProvider({ connection, children }) {
  const [experimentId, setExperimentId] = useState(null);

  const handleSetExperimentId = useCallback(
    async (id) => {
      console.log('Setting experimentId:', id);
      setExperimentId(id);

      if (experimentId === null || !window.storage || !connection) return;

      const connectionWithoutDots = connection.replace(/\./g, '-');
      window.storage.set(`experimentId.${connectionWithoutDots}`, id);

      let recentExperiments =
        (await window.storage.get(
          `recentExperiments.${connectionWithoutDots}`,
        )) || [];
      if (!Array.isArray(recentExperiments)) {
        recentExperiments = [];
      }
      // Go through each element and delete it if it if can't be parsed as a number
      recentExperiments = recentExperiments.filter((exp) => {
        return !Number.isNaN(Number(exp));
      });
      // first check if id is already in the list
      if (recentExperiments.includes(id)) {
        // If it is, remove it
        recentExperiments = recentExperiments.filter((exp) => exp !== id);
      }
      recentExperiments.push(id);
      if (recentExperiments.length > 5) {
        recentExperiments.shift();
      }
      await window.storage.set(
        `recentExperiments.${connectionWithoutDots}`,
        recentExperiments,
      );
    },
    [connection, experimentId],
  );

  const getRecentExperiments = useCallback(async () => {
    if (!window.storage || !connection) return [];

    const connectionWithoutDots = connection.replace(/\./g, '-');
    const recentExperiments =
      (await window.storage.get(
        `recentExperiments.${connectionWithoutDots}`,
      )) || [];
    return Array.isArray(recentExperiments) ? recentExperiments : [];
  }, [connection]);

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
        handleSetExperimentId(Number(storedExperimentId));
      } else {
        handleSetExperimentId(null);
      }
    }
    if (connection === '' || !connection) {
      handleSetExperimentId(null);
      return;
    }
    getSavedExperimentId();
  }, [connection]);

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
      setExperimentId: handleSetExperimentId,
      experimentInfo,
      experimentInfoError,
      experimentInfoIsLoading,
      experimentInfoMutate,
      getRecentExperiments, // Add the new method to the context value
    };
  }, [
    experimentId,
    handleSetExperimentId,
    experimentInfo,
    experimentInfoError,
    experimentInfoIsLoading,
    experimentInfoMutate,
    getRecentExperiments,
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
 *   getRecentExperiments: () => Promise<string[]>
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
