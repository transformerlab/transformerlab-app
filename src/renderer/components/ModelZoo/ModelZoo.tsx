/* eslint-disable jsx-a11y/anchor-is-valid */
import { useEffect } from 'react';
import Sheet from '@mui/joy/Sheet';
import { StoreIcon, LayersIcon } from 'lucide-react';
import { Tab, TabList, TabPanel, Tabs } from '@mui/joy';
import { useExperimentInfo } from 'renderer/lib/ExperimentInfoContext';
import { useNavigate } from 'react-router-dom';
import LocalModels from './LocalModels';
import ModelGroups from './ModelGroups';
import ModelRegistry from './ModelRegistry';

export default function ModelZoo({ tab = 'store' }) {
  const navigate = useNavigate();
  const { experimentInfo } = useExperimentInfo();

  const isLocalMode = window?.platform?.multiuser !== true;

  // In local mode: tabs are local, generated, groups (the original Model Registry / store).
  // In multiuser mode (!isLocalMode): only 'registry' (new groups view) is available.
  const filteredTab = !isLocalMode
    ? 'registry'
    : tab === 'registry'
      ? 'local'
      : tab;

  // Redirect to local tab if not in local mode and trying to access generated or groups
  useEffect(() => {
    if (!isLocalMode && tab !== 'registry') {
      navigate('/zoo/registry', { replace: true });
    }
    if (isLocalMode && tab === 'registry') {
      navigate('/zoo/local', { replace: true });
    }
  }, [isLocalMode, tab, navigate]);

  return (
    <Sheet
      sx={{
        display: 'flex',
        height: '100%',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      {isLocalMode ? (
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
            navigate(`/zoo/${newValue}`);
          }}
        >
          <TabList>
            <Tab value="local">Local Models</Tab>
            <Tab value="generated">Generated</Tab>
            <Tab value="groups">
              <StoreIcon color="grey" />
              &nbsp; Model Registry
            </Tab>
          </TabList>
          <TabPanel
            value="local"
            sx={{ p: 0, py: 1, height: '100%', overflow: 'hidden' }}
          >
            <LocalModels experimentInfo={experimentInfo} />
          </TabPanel>
          <TabPanel
            value="generated"
            sx={{ p: 0, py: 1, height: '100%', overflow: 'hidden' }}
          >
            <LocalModels
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
      ) : (
        <Tabs
          aria-label="Model Registry tabs"
          size="sm"
          sx={{
            borderRadius: 'lg',
            display: 'flex',
            width: '100%',
            height: '100%',
            overflow: 'unset',
          }}
          value="registry"
        >
          <TabList>
            <Tab value="registry">
              <LayersIcon size={16} color="grey" />
              &nbsp; Model Registry
            </Tab>
          </TabList>
          <TabPanel
            value="registry"
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
            <ModelRegistry />
          </TabPanel>
        </Tabs>
      )}
    </Sheet>
  );
}
