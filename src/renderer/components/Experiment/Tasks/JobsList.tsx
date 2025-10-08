import React from 'react';
import Table from '@mui/joy/Table';
import ButtonGroup from '@mui/joy/ButtonGroup';
import IconButton from '@mui/joy/IconButton';
import { Trash2Icon } from 'lucide-react';
import JobProgress from './JobProgress';

interface JobsListProps {
  jobs: any[];
}

const JobsList: React.FC<JobsListProps> = ({ jobs }) => {
  return (
    <Table>
      <thead>
        <tr>
          <th style={{ width: '60px' }}>ID</th>
          <th>Details</th>
          <th>Status</th>
          <th style={{ width: '400px' }}>Other</th>
        </tr>
      </thead>
      <tbody style={{ overflow: 'auto', height: '100%' }}>
        {jobs?.length > 0 &&
          jobs?.map((job) => (
            <tr key={job.id}>
              <td>
                <b>{job.id}</b>
              </td>
              <td>s</td>
              <td>
                <JobProgress job={job} />
              </td>
              <td>
                <ButtonGroup sx={{ justifyContent: 'flex-end' }}>
                  <IconButton variant="plain">
                    <Trash2Icon style={{ cursor: 'pointer' }} />
                  </IconButton>
                </ButtonGroup>
              </td>
            </tr>
          ))}
      </tbody>
    </Table>
  );
};

export default JobsList;
