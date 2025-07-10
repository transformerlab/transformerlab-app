/* eslint-disable no-nested-ternary */
import { Box, Sheet, Tab, TabList, TabPanel, Tabs, Typography } from '@mui/joy';

import '@xyflow/react/dist/style.css';

import WorkflowList from './WorkflowList/WorkflowList';
import WorkflowRuns from './WorkflowRuns/WorkflowRuns';
import { useExperimentInfo } from 'renderer/lib/ExperimentInfoContext';
// import WorkflowTriggers from './WorkflowTriggers/WorkflowTriggers';

export default function Workflows({}) {
  const { experimentInfo } = useExperimentInfo();

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
            <Tab>Runs</Tab>
            {/* <Tab>Triggers</Tab> */}
          </TabList>
          <TabPanel
            value={0}
            sx={{ width: '100%', height: '100%', overflow: 'hidden' }}
          >
            <WorkflowList experimentInfo={experimentInfo} />
          </TabPanel>
          <TabPanel value={1} sx={{ width: '100%', overflow: 'hidden' }}>
            <WorkflowRuns experimentInfo={experimentInfo} />
          </TabPanel>
          {/* <TabPanel value={2} sx={{ width: '100%', overflow: 'hidden' }}>
            <WorkflowTriggers experimentInfo={experimentInfo} />
          </TabPanel> */}
        </Tabs>
      </Sheet>
    </Sheet>
  );
}
