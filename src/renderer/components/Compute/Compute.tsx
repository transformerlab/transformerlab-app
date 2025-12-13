import React, { useState } from 'react';
import { Tabs, TabList, Tab, TabPanel } from '@mui/joy';
import Clusters from './Clusters';

const Compute = () => {
  const [activeTab, setActiveTab] = useState(0);

  return (
    <Tabs
      value={activeTab}
      onChange={(event, newValue) => setActiveTab(Number(newValue) ?? 0)}
    >
      <TabList>
        <Tab>Clusters</Tab>
      </TabList>
      <TabPanel value={0}>
        <Clusters />
      </TabPanel>
    </Tabs>
  );
};

export default Compute;
