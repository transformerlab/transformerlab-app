/* eslint-disable jsx-a11y/anchor-is-valid */
import Sheet from '@mui/joy/Sheet';
import {
  Alert,
  Button,
  CircularProgress,
  Tab,
  TabList,
  TabPanel,
  Tabs,
} from '@mui/joy';
import { Circle, StoreIcon } from 'lucide-react';

import { usePluginStatus } from 'renderer/lib/transformerlab-api-sdk';
import * as chatAPI from 'renderer/lib/transformerlab-api-sdk';
import { useState, useEffect, useRef } from 'react';
import PluginGallery from './PluginGallery';
import LocalPlugins from './LocalPlugins';
import OneTimePopup from '../Shared/OneTimePopup';

export default function Plugins({ experimentInfo }) {
  const { data: outdatedPlugins, mutate: outdatePluginsMutate } =
    usePluginStatus(experimentInfo);
  const [installing, setInstalling] = useState(null);
  const [autoUpdatePlugins, setAutoUpdatePlugins] = useState(false);
  const updateInProgress = useRef(false);

  useEffect(() => {
    const fetchAutoUpdateSetting = async () => {
      const autoUpdateValue = await window.storage.get('AUTO_UPDATE_PLUGINS');
      setAutoUpdatePlugins(
        autoUpdateValue === null ? false : autoUpdateValue === 'true',
      );
    };
    fetchAutoUpdateSetting();
  }, []);

  // Add effect to handle auto-update when outdatedPlugins changes
  useEffect(() => {
    const autoUpdate = async () => {
      // Add check for updateInProgress to prevent duplicate updates
      if (
        autoUpdatePlugins &&
        outdatedPlugins?.length > 0 &&
        installing === null &&
        !updateInProgress.current
      ) {
        try {
          updateInProgress.current = true;
          const pluginsToUpdate = outdatedPlugins.map((plugin) => ({
            name: plugin.name,
            uniqueId: plugin.uniqueId,
          }));

          for (const plugin of pluginsToUpdate) {
            setInstalling(plugin.name);
            await fetch(
              chatAPI.Endpoints.Experiment.InstallPlugin(
                experimentInfo?.id,
                plugin.uniqueId,
              ),
            );
            console.log('Auto-updating plugin:', plugin);
          }

          // After updates are complete, mutate data and reset state
          await outdatePluginsMutate();
          setInstalling(null);
        } finally {
          // Ensure we reset the flag even if an error occurs
          updateInProgress.current = false;
        }
      }
    };

    autoUpdate();
  }, [
    outdatedPlugins,
    autoUpdatePlugins,
    experimentInfo,
    installing,
    outdatePluginsMutate,
  ]);

  if (installing !== null) {
    return (
      <Sheet
        sx={{
          display: 'flex',
          height: '100%',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center',
        }}
      >
        <Alert color="warning">
          <CircularProgress />
          Installing {installing} plugin. Please wait...
        </Alert>
      </Sheet>
    );
  }

  return (
    <Sheet sx={{ display: 'flex', height: '100%', flexDirection: 'column' }}>
      <OneTimePopup title="About Plugins">
        <>
          <p>
            Plugins enable additional functionality to Transformer Lab. The
            available plugins are based on your hardware (e.g. whether or not
            you have a GPU).
          </p>
          <p>You can add a plugin by clicking on "Install".</p>
        </>
      </OneTimePopup>
      {outdatedPlugins?.length > 0 && !autoUpdatePlugins && (
        <Alert sx={{ mb: 2 }}>
          <b>{outdatedPlugins?.length}</b> plugins have necessary updates.
          Update now?
          <Button
            color="success"
            onClick={async () => {
              const pluginsToUpdate = outdatedPlugins.map((plugin) => ({
                name: plugin.name,
                // version: plugin.version,
                uniqueId: plugin.uniqueId,
              }));
              // eslint-disable-next-line no-restricted-syntax
              for (const plugin of pluginsToUpdate) {
                setInstalling(plugin.name);
                await fetch(
                  chatAPI.Endpoints.Experiment.InstallPlugin(
                    experimentInfo?.id,
                    plugin.uniqueId,
                  ),
                );
                console.log('Installing plugin:', plugin);
              }
              outdatePluginsMutate();
              setInstalling(null);
            }}
          >
            Update All
          </Button>
        </Alert>
      )}
      <Tabs
        aria-label="Plugin Tabs"
        defaultValue={1}
        size="sm"
        sx={{
          borderRadius: 'lg',
          height: '100%',
          display: 'flex',
          width: '100%',
        }}
      >
        <TabList>
          <Tab>Installed Plugin Scripts</Tab>
          <Tab>
            <StoreIcon color="grey" />
            &nbsp; Plugin Script Store
          </Tab>
        </TabList>
        <TabPanel
          value={0}
          sx={{
            overflow: 'hidden',
            height: '100%',
            flexDirection: 'column',
          }}
        >
          <Sheet
            sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}
          >
            <LocalPlugins experimentInfo={experimentInfo} />
          </Sheet>
        </TabPanel>
        <TabPanel
          value={1}
          sx={{
            overflow: 'hidden',
            height: '100%',
            flexDirection: 'column',
          }}
        >
          <Sheet
            sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}
          >
            <PluginGallery experimentInfo={experimentInfo} />
          </Sheet>
        </TabPanel>
      </Tabs>
    </Sheet>
  );
}
