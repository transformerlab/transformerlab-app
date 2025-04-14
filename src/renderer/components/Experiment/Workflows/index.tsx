/* eslint-disable no-nested-ternary */
import { Box, Sheet, Tab, TabList, TabPanel, Tabs, Typography } from '@mui/joy';

import '@xyflow/react/dist/style.css';

import WorkflowList from './WorkflowList';
import WorkflowRuns from './WorkflowRuns';

export default function Workflows({ experimentInfo }) {
  return (
    <Sheet
      sx={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        overflow: 'hidden',
        mb: 3,
      }}
    >
      <Sheet
        sx={{
          display: 'flex',
          flexDirection: 'row',
          gap: 2,
          width: '100%',
          height: '100%',
        }}
      >
        <Tabs
          defaultValue={0}
          sx={{ width: '100%', height: '100%', display: 'flex' }}
        >
          <TabList>
            <Tab>Workflows</Tab>
            <Tab>Workflow Runs</Tab>
          </TabList>
          <TabPanel
            value={0}
            sx={{ width: '100%', height: '100%', overflow: 'hidden' }}
          >
            <WorkflowList experimentInfo={experimentInfo} />
          </TabPanel>
          <TabPanel value={1} sx={{ width: '100%' }}>
            <WorkflowRuns experimentInfo={experimentInfo} />
          </TabPanel>
        </Tabs>
      </Sheet>
    </Sheet>
  );
}
