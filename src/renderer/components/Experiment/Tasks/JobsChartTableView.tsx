import { Box, Link, Table, Typography } from '@mui/joy';
import { Link as RouterLink } from 'react-router-dom';
import { EvalTableRow } from './JobsChartShared';

interface JobsChartTableViewProps {
  rows: EvalTableRow[];
  metric: string;
  experimentId?: string | null;
  onClose: () => void;
}

export default function JobsChartTableView({
  rows,
  metric,
  experimentId,
  onClose,
}: JobsChartTableViewProps) {
  if (rows.length === 0) {
    return (
      <Box
        sx={{
          flex: 1,
          minHeight: 0,
          border: '1px solid',
          borderColor: 'neutral.outlinedBorder',
          borderRadius: 'sm',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Typography level="body-sm" sx={{ color: 'text.tertiary' }}>
          No jobs have a value for the selected metric.
        </Typography>
      </Box>
    );
  }
  return (
    <Box
      sx={{
        flex: 1,
        overflow: 'auto',
        border: '1px solid',
        borderColor: 'neutral.outlinedBorder',
        borderRadius: 'sm',
      }}
    >
      <Table stickyHeader>
        <thead>
          <tr>
            <th>Job</th>
            <th>{metric || 'Score'}</th>
            <th>Status</th>
            <th>Discarded</th>
            <th>Created</th>
            <th>Description</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={`${row.jobId}-${metric}`}>
              <td>
                {experimentId ? (
                  <Link
                    component={RouterLink}
                    to={`/experiment/${experimentId}/jobs/${row.jobId}`}
                    onClick={onClose}
                  >
                    {row.jobId.slice(0, 8)}
                  </Link>
                ) : (
                  row.jobId.slice(0, 8)
                )}
              </td>
              <td>{row.metrics[metric]}</td>
              <td>{row.status || '-'}</td>
              <td>{row.discarded ? 'Yes' : 'No'}</td>
              <td>{row.createdAt ? row.createdAt.toLocaleString() : '-'}</td>
              <td>{row.description || <i>No description</i>}</td>
            </tr>
          ))}
        </tbody>
      </Table>
    </Box>
  );
}
