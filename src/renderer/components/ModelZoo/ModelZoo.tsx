/* eslint-disable jsx-a11y/anchor-is-valid */
import { useState, useEffect } from 'react';
import Sheet from '@mui/joy/Sheet';
import { StoreIcon } from 'lucide-react';
import { Tab, TabList, TabPanel, Tabs } from '@mui/joy';
import { useExperimentInfo } from 'renderer/lib/ExperimentInfoContext';
import { useNavigate } from 'react-router-dom';
import LocalModels from './LocalModels';
import ModelGroups from './ModelGroups';
import { apiHealthz } from 'renderer/lib/transformerlab-api-sdk';

export default function ModelZoo({ tab = 'store' }) {
  const navigate = useNavigate();
  const { experimentInfo } = useExperimentInfo();
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
        console.error('Failed to fetch healthz data:', error);
      }
    };

    fetchHealthz();
  }, []);

  const isS3Mode = mode === 's3';

  // If we are in S3 Mode, even if the default tab is 'groups' or 'generated', we should
  // show the 'local' tab instead, since 'groups' and 'generated' don't work in this mode
  const filteredTab =
    isS3Mode && (tab === 'groups' || tab === 'generated') ? 'local' : tab;

  // Redirect to local tab if in s3 mode and trying to access generated or groups
  useEffect(() => {
    if (isS3Mode && (tab === 'generated' || tab === 'groups')) {
      navigate('/zoo/local', { replace: true });
    }
  }, [isS3Mode, tab, navigate]);

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
        value={filteredTab}
        onChange={(e, newValue) => {
          navigate('/zoo/' + newValue);
        }}
      >
        <TabList>
          <Tab value="local">Local Models</Tab>
          {!isS3Mode && <Tab value="generated">Generated</Tab>}
          {!isS3Mode && (
            <Tab value="groups">
              <StoreIcon color="grey" />
              &nbsp; Model Registry
            </Tab>
          )}
        </TabList>
        <TabPanel
          value="local"
          sx={{ p: 0, py: 1, height: '100%', overflow: 'hidden' }}
        >
          <LocalModels pickAModelMode={false} experimentInfo={experimentInfo} />
        </TabPanel>
        {!isS3Mode && (
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
        )}
        {!isS3Mode && (
          <TabPanel
            value="groups"
            sx={{
              p: 0,
              py: 1,
              height: '100%',
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column',
              flex: 1,
            }}
          >
            <ModelGroups experimentInfo={experimentInfo} />
          </TabPanel>
        )}
      </Tabs>
    </Sheet>
  );
}
