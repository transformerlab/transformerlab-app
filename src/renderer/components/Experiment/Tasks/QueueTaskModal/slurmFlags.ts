import type { SlurmFlag } from './types';

// Kept separate from SlurmFlagsSection.tsx so that the component file only
// exports a component (required for React Fast Refresh).
let nextFlagId = 0;

export const createSlurmFlag = (value = ''): SlurmFlag => ({
  id: `slurm-flag-${++nextFlagId}`,
  value,
});
