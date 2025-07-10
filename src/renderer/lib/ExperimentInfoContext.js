// src/contexts/ExperimentInfoContext.js
import React, { createContext, useContext, useMemo } from 'react'; // Import useMemo
import useSWR from 'swr';

import * as chatAPI from './transformerlab-api-sdk.ts'; // Adjust the import path as necessary

const fetcher = (url) => fetch(url).then((res) => res.json());

const ExperimentInfoContext = createContext(undefined);

export function ExperimentInfoProvider({ experimentId, children }) {
  const {
    data: experimentInfo,
    error: experimentInfoError,
    isLoading: experimentInfoIsLoading,
    mutate: experimentInfoMutate,
  } = useSWR(chatAPI.Endpoints.Experiment.Get(experimentId), fetcher);

  // Use useMemo to memoize the contextValue object
  const contextValue = useMemo(() => {
    return {
      experimentInfo,
      experimentInfoError,
      experimentInfoIsLoading,
      experimentInfoMutate,
    };
  }, [
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

export function useExperimentInfo() {
  const context = useContext(ExperimentInfoContext);

  if (context === undefined) {
    throw new Error(
      'useExperimentInfo must be used within an ExperimentInfoProvider',
    );
  }

  return context;
}
