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
      const url = chatAPI.Endpoints.Jobs.StreamJobsOfType(
        experimentId,
        type,
        status,
      );

      const response = await chatAPI.authenticatedFetch(url, {
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
              setJobs((prevJobs) => {
                // Check if job already exists to avoid duplicates
                const exists = prevJobs.some(
                  (existingJob) => existingJob.id === job.id,
                );
                if (!exists) {
                  return [...prevJobs, job];
                }
                return prevJobs;
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
