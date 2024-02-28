/* eslint-disable jsx-a11y/anchor-is-valid */
import Sheet from '@mui/joy/Sheet';
import { Tab, TabList, TabPanel, Tabs } from '@mui/joy';
import { StoreIcon } from 'lucide-react';

import PluginGallery from './PluginGallery';
import LocalPlugins from './LocalPlugins';

export default function Plugins({ experimentInfo }) {
  return (
    <Sheet sx={{ display: 'flex', height: '100%' }}>
      <Tabs
        aria-label="Plugin Tabs"
        defaultValue={0}
        size="sm"
        sx={{
          borderRadius: 'lg',
          height: '100%',
          display: 'flex',
          width: '100%',
        }}
      >
        <TabList tabFlex={1}>
          <Tab>Installed Plugin Scripts</Tab>
          <Tab>
            <StoreIcon color="grey" />
            &nbsp; Plugin Script Store
          </Tab>
        </TabList>
        <TabPanel value={0} sx={{ overflow: 'auto' }}>
          <LocalPlugins experimentInfo={experimentInfo} />
        </TabPanel>
        <TabPanel
          value={1}
          sx={{
            overflow: 'hidden',
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <PluginGallery experimentInfo={experimentInfo} />
        </TabPanel>
      </Tabs>
    </Sheet>
  );
}
