/* eslint-disable jsx-a11y/anchor-is-valid */
import Sheet from '@mui/joy/Sheet';
import { Tab, TabList, TabPanel, Tabs } from '@mui/joy';
import { StoreIcon } from 'lucide-react';

import { useExperimentInfo } from 'renderer/lib/ExperimentInfoContext';

export default function TaskLibrary({}) {
  const { experimentInfo } = useExperimentInfo();

  return (
    <Sheet sx={{ display: 'flex', height: '100%', flexDirection: 'column' }}>
      List of Tasks
    </Sheet>
  );
}
