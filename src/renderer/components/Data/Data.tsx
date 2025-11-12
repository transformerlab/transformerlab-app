/* eslint-disable jsx-a11y/anchor-is-valid */
import Sheet from '@mui/joy/Sheet';
import { Tab, TabList, TabPanel, Tabs, Alert } from '@mui/joy';
import { StoreIcon } from 'lucide-react';

import { useGPUOrchestrationAuth } from 'renderer/lib/transformerlab-api-sdk';
import DataStore from './DataStore';
import LocalDatasets from './LocalDatasets';
import GeneratedDatasets from './GeneratedDatasets';

export default function Data({ gpuOrchestrationServer = '' }) {
  // Check authentication and GPU orchestration mode using centralized hook
  const { shouldBlockActions } = useGPUOrchestrationAuth();

  return (
    <Sheet sx={{ display: 'flex', height: '100%', flexDirection: 'column' }}>
      {shouldBlockActions && (
        <Alert color="warning" sx={{ mb: 2 }}>
          You must be logged in to use the Datasets page in GPU orchestration
          mode.
        </Alert>
      )}
      <Tabs
        aria-label="Dataset Tabs"
        defaultValue={0}
        size="sm"
        sx={{
          borderRadius: 'lg',
          height: '100%',
          display: 'flex',
          width: '100%',
        }}
      >
        <TabList>
          <Tab>Local Datasets</Tab>
          <Tab>Generated Datasets</Tab>
          {gpuOrchestrationServer === '' && (
            <Tab>
              <StoreIcon color="grey" />
              &nbsp; Dataset Store
            </Tab>
          )}
        </TabList>
        <TabPanel value={0} sx={{ overflow: 'hidden' }}>
          <LocalDatasets shouldBlockActions={shouldBlockActions} />
        </TabPanel>
        <TabPanel value={1} sx={{ overflow: 'hidden' }}>
          <GeneratedDatasets shouldBlockActions={shouldBlockActions} />
        </TabPanel>
        <TabPanel value={2} sx={{ overflow: 'hidden' }}>
          <DataStore />
        </TabPanel>
      </Tabs>
    </Sheet>
  );
}
