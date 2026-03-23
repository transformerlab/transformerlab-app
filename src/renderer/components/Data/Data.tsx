/* eslint-disable jsx-a11y/anchor-is-valid */
import Sheet from '@mui/joy/Sheet';
import { Tab, TabList, TabPanel, Tabs } from '@mui/joy';
import { StoreIcon, LayersIcon } from 'lucide-react';

import DataStore from './DataStore';
import LocalDatasets from './LocalDatasets';
import GeneratedDatasets from './GeneratedDatasets';
import DatasetRegistry from './DatasetRegistry';

export default function Data({ tab = 'local' }) {
  const isLocalMode = window?.platform?.multiuser !== true;

  return (
    <Sheet sx={{ display: 'flex', height: '100%' }}>
      {isLocalMode ? (
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
            <Tab>
              <StoreIcon color="grey" />
              &nbsp; Dataset Store
            </Tab>
          </TabList>
          <TabPanel value={0} sx={{ overflow: 'hidden' }}>
            <LocalDatasets />
          </TabPanel>
          <TabPanel value={1} sx={{ overflow: 'hidden' }}>
            <GeneratedDatasets />
          </TabPanel>
          <TabPanel value={2} sx={{ overflow: 'hidden' }}>
            <DataStore />
          </TabPanel>
        </Tabs>
      ) : (
        <Tabs
          aria-label="Dataset Registry tabs"
          value="registry"
          size="sm"
          sx={{
            borderRadius: 'lg',
            height: '100%',
            display: 'flex',
            width: '100%',
          }}
        >
          <TabList>
            <Tab value="registry">
              <LayersIcon size={16} color="grey" />
              &nbsp; Dataset Registry
            </Tab>
          </TabList>
          <TabPanel
            value="registry"
            sx={{
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column',
              flex: 1,
            }}
          >
            <DatasetRegistry />
          </TabPanel>
        </Tabs>
      )}
    </Sheet>
  );
}
