import React, { useState } from 'react';
import { Tabs, TabList, Tab, TabPanel } from '@mui/joy';
import Clusters from './Clusters';
import Resources from './Resources';

const Compute = () => {
  const [activeTab, setActiveTab] = useState(0);

  return (
    <Tabs
      value={activeTab}
      onChange={(event, newValue) => setActiveTab(Number(newValue) ?? 0)}
    >
      <TabList>
        <Tab>Clusters</Tab>
        <Tab>Resources</Tab>
      </TabList>
      <TabPanel value={0}>
        <Clusters />
      </TabPanel>
      <TabPanel value={1}>
        <Resources />
      </TabPanel>
    </Tabs>
  );
};

export default Compute;
