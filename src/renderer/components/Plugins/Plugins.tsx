/* eslint-disable jsx-a11y/anchor-is-valid */
import Sheet from '@mui/joy/Sheet';
import { Alert, Button, Tab, TabList, TabPanel, Tabs } from '@mui/joy';
import { StoreIcon } from 'lucide-react';

import { usePluginStatus } from 'renderer/lib/transformerlab-api-sdk';
import PluginGallery from './PluginGallery';
import LocalPlugins from './LocalPlugins';
import OneTimePopup from '../Shared/OneTimePopup';

export default function Plugins({ experimentInfo }) {
  const { data: outdatedPlugins } = usePluginStatus(experimentInfo);

  return (
    <Sheet sx={{ display: 'flex', height: '100%', flexDirection: 'column' }}>
      <OneTimePopup title="About Plugins">
        <>
          <p>
            Plugins enable additional functionality to Transformer Lab. The
            available plugins are based on your hardware (e.g. whether or not
            you have a GPU).
          </p>
          <p>You can add a plugin by clicking on "Install".</p>
        </>
      </OneTimePopup>
      <Alert sx={{ mb: 2 }}>
        <b>{outdatedPlugins?.length}</b> plugins have necessary updates. Update
        now?
        <Button
          color="success"
          onClick={() => {
            const pluginsToUpdate = outdatedPlugins.map((plugin) => ({
              name: plugin.name,
              // version: plugin.version,
            }));
            alert(`updating: ${JSON.stringify(pluginsToUpdate)}`);
          }}
        >
          Update All
        </Button>
      </Alert>
      <Tabs
        aria-label="Plugin Tabs"
        defaultValue={1}
        size="sm"
        sx={{
          borderRadius: 'lg',
          height: '100%',
          display: 'flex',
          width: '100%',
        }}
      >
        <TabList>
          <Tab>Installed Plugin Scripts</Tab>
          <Tab>
            <StoreIcon color="grey" />
            &nbsp; Plugin Script Store
          </Tab>
        </TabList>
        <TabPanel
          value={0}
          sx={{
            overflow: 'hidden',
            height: '100%',
            flexDirection: 'column',
          }}
        >
          <Sheet
            sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}
          >
            <LocalPlugins experimentInfo={experimentInfo} />
          </Sheet>
        </TabPanel>
        <TabPanel
          value={1}
          sx={{
            overflow: 'hidden',
            height: '100%',
            flexDirection: 'column',
          }}
        >
          <Sheet
            sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}
          >
            <PluginGallery experimentInfo={experimentInfo} />
          </Sheet>
        </TabPanel>
      </Tabs>
    </Sheet>
  );
}
