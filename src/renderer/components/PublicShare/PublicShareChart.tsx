import { Box } from '@mui/joy';
import JobsChartView from '../Experiment/Tasks/JobsChartView';

interface Props {
  jobs: unknown[];
}

export default function PublicShareChart({ jobs }: Props) {
  return (
    <Box
      sx={{
        height: '75vh',
        display: 'flex',
        flexDirection: 'column',
        minHeight: 0,
      }}
    >
      <JobsChartView jobs={jobs} />
    </Box>
  );
}
