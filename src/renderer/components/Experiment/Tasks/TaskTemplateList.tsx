import React from 'react';
import { Table, ButtonGroup, Typography } from '@mui/joy';

type TaskRow = {
  id: string;
  name: string;
  description?: string;
  type?: string;
  datasets?: any;
  config: string;
  created?: string;
  updated?: string;
};

type TaskTemplateListProps = {
  tasksList: TaskRow[];
};

const TaskTemplateList: React.FC<TaskTemplateListProps> = ({ tasksList }) => (
  <Table>
    <thead>
      <tr>
        <th width="150px">Name</th>
        <th>Details</th>
        <th>Description</th>
        <th style={{ textAlign: 'right' }} width="250px">
          &nbsp;
        </th>
      </tr>
    </thead>
    <tbody>
      {
        // Format of template data by column:
        // 0 = id, 1 = name, 2 = description, 3 = type, 4 = datasets, 5 = config, 6 = created, 7 = updated
        tasksList.map((row) => (
          <tr key={row.id}>
            <td>
              <Typography level="title-sm" sx={{ overflow: 'clip' }}>
                {row.name}
              </Typography>
            </td>
            <td style={{ overflow: 'clip' }}>a </td>
            <td style={{ overflow: 'hidden' }}>aa</td>
            <td
              style={{
                overflow: 'visible',
              }}
            >
              <ButtonGroup sx={{ justifyContent: 'flex-end' }}>aa</ButtonGroup>
            </td>
          </tr>
        ))
      }
    </tbody>
  </Table>
);

export default TaskTemplateList;
