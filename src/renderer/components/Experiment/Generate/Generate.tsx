/* eslint-disable jsx-a11y/anchor-is-valid */
import { useState } from 'react';

import * as chatAPI from 'renderer/lib/transformerlab-api-sdk';

import Sheet from '@mui/joy/Sheet';

import { Typography, Option, Stack } from '@mui/joy';

import GenerateJobsTable from './GenerateJobsTable';
import GenerateTasksTable from './GenerateTasksTable';

function getTemplateParametersForPlugin(pluginName, plugins) {
  if (!pluginName || !plugins) {
    return [];
  }

  const plugin = plugins.find((row) => row.name === pluginName);
  if (plugin) {
    return plugin?.info?.template_parameters[0]?.options.map((row) => (
      <Option value={row} key={row}>
        {row}
      </Option>
    ));
  }
  return [];
}

const fetcher = (url) => fetch(url).then((res) => res.json());

export default function Generate({
  experimentInfo,
  addGeneration,
  experimentInfoMutate,
}) {
  const [currentPlugin, setCurrentPlugin] = useState('');
  const [currentGenerationId, setCurrentGenerationId] = useState('');

  async function saveFile() {
    // const value = editorRef?.current?.getValue();

    if (value) {
      // Use fetch to post the value to the server
      await fetch(
        chatAPI.Endpoints.Experiment.SavePlugin(
          project,
          generationName,
          'main.py',
        ),
        {
          method: 'POST',
          body: value,
        },
      ).then(() => {});
    }
  }

  if (!experimentInfo) {
    return 'No experiment selected';
  }

  return (
    <Sheet
      sx={{
        overflow: 'hidden',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Plugins:
        {JSON.stringify(plugins)} */}

      <GenerateTasksTable
        experimentInfo={experimentInfo}
        experimentInfoMutate={experimentInfoMutate}
        setCurrentPlugin={setCurrentPlugin}
        setCurrentGenerationId={setCurrentGenerationId}
        currentPlugin={currentPlugin}
        currentGenerationId={currentGenerationId}
      />
      <Sheet
        sx={{
          overflow: 'hidden',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          flex: 2,
          pt: 2,
        }}
      >
        <GenerateJobsTable />
      </Sheet>
    </Sheet>
  );
}
