/* eslint-disable jsx-a11y/anchor-is-valid */
import { useState, useCallback } from 'react';
import Sheet from '@mui/joy/Sheet';
import { StoreIcon } from 'lucide-react';
import { Tab, TabList, TabPanel, Tabs } from '@mui/joy';
import ModelStore from './ModelStore';
import LocalModels from './LocalModels';
import { useNavigate } from 'react-router-dom';

export default function ModelZoo({ experimentInfo, tab = 'store' }) {
  const navigate = useNavigate();

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
        aria-label="Basic tabs"
        size="sm"
        sx={{
          borderRadius: 'lg',
          display: 'flex',
          width: '100%',
          height: '100%',
          overflow: 'unset',
        }}
        value={tab}
        onChange={(e, newValue) => {
          navigate('/zoo/' + newValue);
        }}
      >
        <TabList>
          <Tab value="local">Local Models</Tab>
          <Tab value="generated">Generated</Tab>
          <Tab value="store">
            <StoreIcon color="grey" />
            &nbsp; Model Store
          </Tab>
        </TabList>
        <TabPanel
          value="local"
          sx={{ p: 0, py: 1, height: '100%', overflow: 'hidden' }}
        >
          <LocalModels pickAModelMode={false} experimentInfo={experimentInfo} />
        </TabPanel>
        <TabPanel
          value="generated"
          sx={{ p: 0, py: 1, height: '100%', overflow: 'hidden' }}
        >
          <LocalModels
            pickAModelMode={false}
            experimentInfo={experimentInfo}
            showOnlyGeneratedModels
          />
        </TabPanel>
        <TabPanel
          value="store"
          sx={{ p: 0, py: 1, height: '100%', overflow: 'hidden' }}
        >
          <ModelStore />
        </TabPanel>
      </Tabs>
    </Sheet>
  );
}
