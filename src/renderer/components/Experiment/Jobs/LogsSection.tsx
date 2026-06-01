import React from 'react';
import EmbeddableStreamingOutput from '../Tasks/EmbeddableStreamingOutput';

export default function LogsSection({
  jobId,
  jobStatus,
  providerRequestId,
}: {
  jobId: string;
  jobStatus: string;
  providerRequestId?: string;
}) {
  return (
    <EmbeddableStreamingOutput
      jobId={jobId}
      jobStatus={jobStatus}
      tabs={
        providerRequestId
          ? ['output', 'provider', 'orchestration']
          : ['output', 'provider']
      }
      providerRequestId={providerRequestId}
    />
  );
}
