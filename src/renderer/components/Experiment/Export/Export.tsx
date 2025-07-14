/* eslint-disable jsx-a11y/anchor-is-valid */

import Sheet from '@mui/joy/Sheet';

import { useExperimentInfo } from 'renderer/lib/ExperimentInfoContext.js';
import ExportJobsTable from './ExportJobsTable';
import ExportTasksTable from './ExportTasksTable';

export default function Export() {
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
      <ExportTasksTable experimentInfo={experimentInfo} />
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
        <ExportJobsTable />
      </Sheet>
    </Sheet>
  );
}
