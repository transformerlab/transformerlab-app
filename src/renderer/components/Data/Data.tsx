/* eslint-disable jsx-a11y/anchor-is-valid */
import Sheet from '@mui/joy/Sheet';
import { Tab, TabList, TabPanel, Tabs } from '@mui/joy';
import { LayersIcon } from 'lucide-react';
import DatasetRegistry from './DatasetRegistry';

export default function Data({ tab = 'local' }) {
  return (
    <Sheet sx={{ display: 'flex', height: '100%' }}>
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
    </Sheet>
  );
}
