import { useState, useEffect, useCallback } from 'react';
import * as chatAPI from 'renderer/lib/transformerlab-api-sdk';

interface UseStreamingJobsResult {
  jobs: any[];
  isLoading: boolean;
  error: string | null;
  refetch: () => void;
}

export const useStreamingJobs = (
  experimentId: string | undefined,
  type: string = '',
  status: string = '',
): UseStreamingJobsResult => {
  const [jobs, setJobs] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchJobs = useCallback(async () => {
    if (!experimentId) {
      setJobs([]);
      return;
    }

    setIsLoading(true);
    setError(null);
    setJobs([]);

    try {
      // First, get job IDs quickly
      const idsUrl = chatAPI.Endpoints.Jobs.GetJobIds(experimentId, type, status);
      const idsResponse = await chatAPI.authenticatedFetch(idsUrl, {
        method: 'GET',
      });

      if (!idsResponse.ok) {
        throw new Error(`HTTP error! status: ${idsResponse.status}`);
      }

      const idsData = await idsResponse.json();
      const jobIds = idsData.job_ids || [];

      // Create placeholder jobs immediately
      const placeholderJobs = jobIds.map((id: string) => ({
        id: String(id), // Ensure consistent string IDs
        type: 'PLACEHOLDER',
        status: 'LOADING',
        job_data: {},
        is_placeholder: true
      }));
      setJobs(placeholderJobs);

      // Now stream the actual job data
      const streamUrl = chatAPI.Endpoints.Jobs.StreamJobsOfType(experimentId, type, status);
      const response = await chatAPI.authenticatedFetch(streamUrl, {
        method: 'GET',
        headers: {
          Accept: 'text/event-stream',
          'Cache-Control': 'no-cache',
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('No response body reader available');
      }

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();

        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || ''; // Keep the last incomplete line in buffer

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6); // Remove 'data: ' prefix

            if (data === '[DONE]') {
              setIsLoading(false);
              return;
            }

            try {
              const job = JSON.parse(data);
              // Ensure job ID is a string for consistent comparison
              job.id = String(job.id);
              setJobs(prevJobs => {
                // Replace placeholder with real job data
                const jobIndex = prevJobs.findIndex(existingJob => existingJob.id === job.id);
                if (jobIndex !== -1) {
                  // Replace existing placeholder
                  const newJobs = [...prevJobs];
                  newJobs[jobIndex] = job;
                  return newJobs;
                } else {
                  // Add new job if no placeholder exists
                  return [...prevJobs, job];
                }
              });
            } catch (parseError) {
              console.warn('Failed to parse job data:', data);
            }
          }
        }
      }
    } catch (err) {
      console.error('Error streaming jobs:', err);
      setError(err instanceof Error ? err.message : 'Unknown error occurred');
    } finally {
      setIsLoading(false);
    }
  }, [experimentId, type, status]);

  useEffect(() => {
    fetchJobs();
  }, [fetchJobs]);

  return {
    jobs,
    isLoading,
    error,
    refetch: fetchJobs,
  };
};
