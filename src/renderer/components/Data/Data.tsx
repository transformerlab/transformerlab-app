/* eslint-disable jsx-a11y/anchor-is-valid */
import Sheet from '@mui/joy/Sheet';
import { Tab, TabList, TabPanel, Tabs } from '@mui/joy';
import { StoreIcon } from 'lucide-react';

import DataStore from './DataStore';
import LocalDatasets from './LocalDatasets';

export default function Data() {
  return (
    <Sheet sx={{ display: 'flex', height: '100%' }}>
      <Tabs
        aria-label="Dataset Tabs"
        defaultValue={0}
        size="sm"
        sx={{
          borderRadius: 'lg',
          height: '100%',
          display: 'flex',
          width: '100%',
          overflow: 'hidden',
        }}
      >
        <TabList tabFlex={1}>
          <Tab>Local Datasets</Tab>
          <Tab>
            <StoreIcon color="grey" />
            &nbsp; Dataset Store
          </Tab>
        </TabList>
        <TabPanel value={0} sx={{ p: 2 }}>
          <LocalDatasets />
        </TabPanel>
        <TabPanel value={1} sx={{ p: 2, height: '100%', overflow: 'hidden' }}>
          <DataStore />
        </TabPanel>
      </Tabs>
    </Sheet>
  );
}
