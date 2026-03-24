/* eslint-disable jsx-a11y/anchor-is-valid */
import { useEffect } from 'react';
import Sheet from '@mui/joy/Sheet';
import { LayersIcon } from 'lucide-react';
import { Tab, TabList, TabPanel, Tabs } from '@mui/joy';
import { useExperimentInfo } from 'renderer/lib/ExperimentInfoContext';
import { useNavigate } from 'react-router-dom';
import ModelRegistry from './ModelRegistry';

export default function ModelZoo({ tab = 'store' }) {
  const navigate = useNavigate();
  const { experimentInfo } = useExperimentInfo();

  useEffect(() => {
    if (tab !== 'registry') {
      navigate('/zoo/registry', { replace: true });
    }
  }, [tab, navigate]);

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
    </Sheet>
  );
}
