/* eslint-disable jsx-a11y/anchor-is-valid */
import { useState, useEffect } from 'react';
import Sheet from '@mui/joy/Sheet';
import { Tab, TabList, TabPanel, Tabs } from '@mui/joy';
import { StoreIcon } from 'lucide-react';

import { apiHealthz } from 'renderer/lib/transformerlab-api-sdk';
import DataStore from './DataStore';
import LocalDatasets from './LocalDatasets';
import GeneratedDatasets from './GeneratedDatasets';

export default function Data() {
  const [mode, setMode] = useState<string>('local');

  // Fetch healthz to get the mode
  useEffect(() => {
    const fetchHealthz = async () => {
      try {
        const data = await apiHealthz();
        if (data?.mode) {
          setMode(data.mode);
        }
      } catch (error) {
        // Silently fail - mode will default to 'local'
      }
    };

    fetchHealthz();
  }, []);

  const isLocalMode = mode === 'local';
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
        }}
      >
        <TabList>
          <Tab>Local Datasets</Tab>
          <Tab>Generated Datasets</Tab>
          {isLocalMode && (
            <Tab>
              <StoreIcon color="grey" />
              &nbsp; Dataset Store
            </Tab>
          )}
        </TabList>
        <TabPanel value={0} sx={{ overflow: 'hidden' }}>
          <LocalDatasets />
        </TabPanel>
        <TabPanel value={1} sx={{ overflow: 'hidden' }}>
          <GeneratedDatasets />
        </TabPanel>
        {isLocalMode && (
          <TabPanel value={2} sx={{ overflow: 'hidden' }}>
            <DataStore />
          </TabPanel>
        )}
      </Tabs>
    </Sheet>
  );
}
