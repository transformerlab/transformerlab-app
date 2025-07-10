/* eslint-disable jsx-a11y/anchor-is-valid */

import Sheet from '@mui/joy/Sheet';

import { useExperimentInfo } from 'renderer/lib/ExperimentInfoContext.js';
import EvalJobsTable from './EvalJobsTable.tsx';
import EvalTasksTable from './EvalTasksTable';

export default function Eval({}) {
  const { experimentInfo } = useExperimentInfo();
  if (!experimentInfo) {
    return 'No experiment selected';
  }

  return (
    <Sheet
      sx={{
        overflow: 'hidden',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <EvalTasksTable experimentInfo={experimentInfo} />
      <Sheet
        sx={{
          overflow: 'hidden',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          flex: 2,
          pt: 2,
        }}
      >
        <EvalJobsTable />
      </Sheet>
    </Sheet>
  );
}
