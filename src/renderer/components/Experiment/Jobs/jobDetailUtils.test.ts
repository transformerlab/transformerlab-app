import {
  getDefaultSection,
  getVisibleSections,
  generateJobPermalink,
  generateTaskRunsPermalink,
  type SectionKey,
} from './jobDetailUtils';

describe('getDefaultSection', () => {
  it('returns logs for FAILED jobs', () => {
    expect(getDefaultSection('FAILED')).toBe('logs');
  });

  it('returns logs for STOPPED jobs', () => {
    expect(getDefaultSection('STOPPED')).toBe('logs');
  });

  it('returns overview for COMPLETE jobs', () => {
    expect(getDefaultSection('COMPLETE')).toBe('overview');
  });

  it('returns overview for RUNNING jobs', () => {
    expect(getDefaultSection('RUNNING')).toBe('overview');
  });

  it('returns overview for unknown status', () => {
    expect(getDefaultSection('')).toBe('overview');
  });
});

describe('getVisibleSections', () => {
  it('always includes overview, logs, checkpoints, and artifacts', () => {
    const sections = getVisibleSections({ job_data: {} } as any);
    expect(sections).toContain('overview');
    expect(sections).toContain('logs');
    expect(sections).toContain('checkpoints');
    expect(sections).toContain('artifacts');
  });

  it('includes evalResults when job_data.eval_results is non-empty', () => {
    const sections = getVisibleSections({
      job_data: { eval_results: ['file.json'] },
    } as any);
    expect(sections).toContain('evalResults');
  });

  it('excludes evalResults when job_data.eval_results is empty', () => {
    const sections = getVisibleSections({
      job_data: { eval_results: [] },
    } as any);
    expect(sections).not.toContain('evalResults');
  });

  it('excludes evalResults when job_data.eval_results is absent', () => {
    const sections = getVisibleSections({ job_data: {} } as any);
    expect(sections).not.toContain('evalResults');
  });

  it('includes sweepResults when type is SWEEP', () => {
    const sections = getVisibleSections({
      type: 'SWEEP',
      job_data: {},
    } as any);
    expect(sections).toContain('sweepResults');
  });

  it('excludes sweepResults when type is not SWEEP', () => {
    const sections = getVisibleSections({
      type: 'FINE_TUNE',
      job_data: {},
    } as any);
    expect(sections).not.toContain('sweepResults');
  });
});

describe('generateJobPermalink', () => {
  it('builds a hash URL with experiment and job id', () => {
    const link = generateJobPermalink('my-exp', 'abc-123');
    expect(link).toBe('#/experiment/my-exp/jobs/abc-123');
  });
});

describe('generateTaskRunsPermalink', () => {
  it('builds a hash URL with experiment and task id', () => {
    const link = generateTaskRunsPermalink('my-exp', 'task-42');
    expect(link).toBe('#/experiment/my-exp/tasks/task-42/runs');
  });
});
