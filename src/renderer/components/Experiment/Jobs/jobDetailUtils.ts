export type SectionKey =
  | 'overview'
  | 'logs'
  | 'checkpoints'
  | 'artifacts'
  | 'evalResults'
  | 'sweepResults';

export interface JobRecord {
  id: string;
  type?: string;
  status?: string;
  created_at?: string;
  progress?: number;
  job_data: {
    checkpoints?: { filename: string }[];
    artifacts_dir?: string;
    eval_results?: string[];
    sweep_parent?: boolean;
    [key: string]: unknown;
  };
}

export function getDefaultSection(status: string): SectionKey {
  return status === 'FAILED' || status === 'STOPPED' ? 'logs' : 'overview';
}

export function getVisibleSections(job: JobRecord): SectionKey[] {
  const sections: SectionKey[] = [
    'overview',
    'logs',
    'checkpoints',
    'artifacts',
  ];
  const d = job.job_data ?? {};
  if (Array.isArray(d.eval_results) && d.eval_results.length > 0) {
    sections.push('evalResults');
  }
  if (job.type === 'SWEEP') {
    sections.push('sweepResults');
  }
  return sections;
}

export function generateJobPermalink(
  experimentName: string,
  jobId: string,
): string {
  return `#/experiment/${experimentName}/jobs/${jobId}`;
}

export function generateTaskRunsPermalink(
  experimentName: string,
  taskId: string,
): string {
  return `#/experiment/${experimentName}/tasks/${taskId}/runs`;
}
