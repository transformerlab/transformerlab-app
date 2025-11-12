/* eslint-disable jsx-a11y/anchor-is-valid */
import Sheet from '@mui/joy/Sheet';
import { StoreIcon } from 'lucide-react';
import { Tab, TabList, TabPanel, Tabs, Alert } from '@mui/joy';
import { useExperimentInfo } from 'renderer/lib/ExperimentInfoContext';
import { useNavigate } from 'react-router-dom';
import LocalModels from './LocalModels';
import ModelGroups from './ModelGroups';
import { useGPUOrchestrationAuth } from 'renderer/lib/transformerlab-api-sdk';

export default function ModelZoo({
  tab = 'store',
  gpuOrchestrationServer = '',
}) {
  const navigate = useNavigate();
  const { experimentInfo } = useExperimentInfo();

  // Check authentication and GPU orchestration mode using centralized hook
  const { shouldBlockActions } = useGPUOrchestrationAuth();

  // If we are in GPU Orchestration Mode, even if the default tab is 'groups', we should
  // show the 'local' tab instead, since 'groups' doesn't work in this mode
  const filteredTab =
    gpuOrchestrationServer !== '' && tab === 'groups' ? 'local' : tab;

  return (
    <Sheet
      sx={{
        display: 'flex',
        height: '100%',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      {shouldBlockActions && (
        <Alert color="warning" sx={{ mb: 2 }}>
          You must be logged in to use the Model Registry in GPU orchestration
          mode.
        </Alert>
      )}
      <Tabs
        aria-label="Basic tabs"
        size="sm"
        sx={{
          borderRadius: 'lg',
          display: 'flex',
          width: '100%',
          height: '100%',
          overflow: 'unset',
        }}
        value={filteredTab}
        onChange={(e, newValue) => {
          navigate('/zoo/' + newValue);
        }}
      >
        <TabList>
          <Tab value="local">Local Models</Tab>
          <Tab value="generated">Generated</Tab>
          {gpuOrchestrationServer === '' && (
            <Tab value="groups">
              <StoreIcon color="grey" />
              &nbsp; Model Store
            </Tab>
          )}
        </TabList>
        <TabPanel
          value="local"
          sx={{ p: 0, py: 1, height: '100%', overflow: 'hidden' }}
        >
          <LocalModels
            pickAModelMode={false}
            experimentInfo={experimentInfo}
            shouldBlockActions={shouldBlockActions}
          />
        </TabPanel>
        <TabPanel
          value="generated"
          sx={{ p: 0, py: 1, height: '100%', overflow: 'hidden' }}
        >
          <LocalModels
            pickAModelMode={false}
            experimentInfo={experimentInfo}
            showOnlyGeneratedModels
            shouldBlockActions={shouldBlockActions}
          />
        </TabPanel>
        <TabPanel
          value="groups"
          sx={{
            p: 0,
            py: 1,
            height: '100%',
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
            flex: 1,
          }}
        >
          <ModelGroups experimentInfo={experimentInfo} />
        </TabPanel>
      </Tabs>
    </Sheet>
  );
}
