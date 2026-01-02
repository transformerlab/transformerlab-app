// src/contexts/ExperimentInfoContext.js
import React, {
  createContext,
  useContext,
  useMemo,
  useState,
  useEffect,
  useRef,
} from 'react'; // Import useMemo
import useSWR from 'swr';

import * as chatAPI from './transformerlab-api-sdk.ts'; // Adjust the import path as necessary
import { fetcher } from './transformerlab-api-sdk.ts';
import { useAuth } from './authContext';

const ExperimentInfoContext = createContext(undefined);

export function ExperimentInfoProvider({ connection, children }) {
  const [experimentId, setExperimentId] = useState(null);
  const authContext = useAuth();
  const lastAutoSelectedTeamId = useRef(null);

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
        setExperimentId(storedExperimentId);
      } else if (connection && connection !== '') {
        setExperimentId('alpha');
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
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
      dedupingInterval: 30000, // Dedupe requests within 30 seconds
    },
  );

  // Fetch all experiments to auto-select first one when team changes
  const { data: allExperiments, mutate: mutateAllExperiments } = useSWR(
    chatAPI.API_URL() === null ? null : chatAPI.Endpoints.Experiment.GetAll(),
    fetcher,
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
      dedupingInterval: 30000, // Dedupe requests within 30 seconds
    },
  );

  // Auto-select first experiment when team changes and no experiment is selected
  // or if current experiment doesn't exist in the new team's experiments
  useEffect(() => {
    const currentTeamId = authContext?.team?.id;

    // Only run if we have a team, connection, and experiments are loaded
    if (!currentTeamId || !connection || connection === '' || !allExperiments) {
      return;
    }

    // Skip if we've already auto-selected for this team
    if (lastAutoSelectedTeamId.current === currentTeamId) {
      return;
    }

    // If no experiments available, clear selection
    if (allExperiments.length === 0) {
      if (experimentId) {
        setExperimentId(null);
      }
      lastAutoSelectedTeamId.current = currentTeamId;
      return;
    }

    // Check if current experiment exists in the new team's experiments
    const currentExperimentExists = experimentId
      ? allExperiments.some(
          (exp) =>
            exp.id === experimentId ||
            exp.name === experimentId ||
            exp.id === experimentInfo?.id ||
            exp.name === experimentInfo?.name,
        )
      : false;

    // If no experiment is selected, or current experiment doesn't exist in new team,
    // auto-select the first one
    if (
      (!experimentId || !currentExperimentExists) &&
      allExperiments.length > 0
    ) {
      const firstExperiment = allExperiments[0];
      setExperimentId(firstExperiment.name || firstExperiment.id);
      lastAutoSelectedTeamId.current = currentTeamId;
    } else if (currentExperimentExists) {
      // Current experiment exists, mark this team as handled
      lastAutoSelectedTeamId.current = currentTeamId;
    }
  }, [
    authContext?.team?.id,
    allExperiments,
    connection,
    experimentId,
    experimentInfo?.id,
    experimentInfo?.name,
  ]);

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
 *   experimentId: string | null,
 *   setExperimentId: React.Dispatch<React.SetStateAction<string | null>>,
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
