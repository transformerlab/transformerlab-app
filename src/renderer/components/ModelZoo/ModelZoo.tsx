/* eslint-disable jsx-a11y/anchor-is-valid */
import { useState, useCallback } from 'react';
import Sheet from '@mui/joy/Sheet';
import { StoreIcon } from 'lucide-react';
import { Tab, TabList, TabPanel, Tabs } from '@mui/joy';
import ModelStore from './ModelStore';
import LocalModels from './LocalModels';

export default function ModelZoo({ experimentInfo }) {
  return (
    <Sheet
      sx={{
        display: 'flex',
        height: '100%',
      }}
    >
      <Tabs
        aria-label="Basic tabs"
        defaultValue={0}
        size="sm"
        sx={{
          borderRadius: 'lg',
          display: 'flex',
          width: '100%',
          height: '100%',
          overflow: 'unset',
        }}
      >
        <TabList tabFlex={1}>
          <Tab>Local Models</Tab>
          <Tab>
            <StoreIcon color="grey" />
            &nbsp; Model Store
          </Tab>
        </TabList>
        <TabPanel value={0} sx={{ p: 2, height: '100%', overflow: 'hidden' }}>
          <LocalModels pickAModelMode={false} experimentInfo={experimentInfo} />
        </TabPanel>
        <TabPanel value={1} sx={{ p: 2, height: '100%', overflow: 'hidden' }}>
          <Sheet
            sx={{
              overflow: 'hidden',
              height: '100%',
            }}
            id="model-store-tab-panel"
          >
            <ModelStore />
          </Sheet>
        </TabPanel>
      </Tabs>
    </Sheet>
  );
}
