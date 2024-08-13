/* eslint-disable jsx-a11y/anchor-is-valid */
import Sheet from '@mui/joy/Sheet';
import { Tab, TabList, TabPanel, Tabs } from '@mui/joy';
import { StoreIcon } from 'lucide-react';

import PluginGallery from './PluginGallery';
import LocalPlugins from './LocalPlugins';
import OneTimePopup from '../Shared/OneTimePopup';

export default function Plugins({ experimentInfo }) {
  return (
    <Sheet sx={{ display: 'flex', height: '100%' }}>
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
