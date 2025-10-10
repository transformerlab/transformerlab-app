/* eslint-disable jsx-a11y/anchor-is-valid */
import Sheet from '@mui/joy/Sheet';
import { StoreIcon } from 'lucide-react';
import { Tab, TabList, TabPanel, Tabs } from '@mui/joy';
import { useExperimentInfo } from 'renderer/lib/ExperimentInfoContext';
import { useNavigate } from 'react-router-dom';
import LocalModels from './LocalModels';
import ModelGroups from './ModelGroups';

export default function ModelZoo({
  tab = 'store',
  gpuOrchestrationServer = '',
}) {
  const navigate = useNavigate();
  const { experimentInfo } = useExperimentInfo();

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
          <LocalModels pickAModelMode={false} experimentInfo={experimentInfo} />
        </TabPanel>
        <TabPanel
          value="generated"
          sx={{ p: 0, py: 1, height: '100%', overflow: 'hidden' }}
        >
          <LocalModels
            pickAModelMode={false}
            experimentInfo={experimentInfo}
            showOnlyGeneratedModels
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
