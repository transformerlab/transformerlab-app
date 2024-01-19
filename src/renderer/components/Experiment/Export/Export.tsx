import { useRef, useState } from 'react';
import useSWR from 'swr';

import * as chatAPI from 'renderer/lib/transformerlab-api-sdk';

import Sheet from '@mui/joy/Sheet';
import { Button, Divider, Table, Typography } from '@mui/joy';
import {
    ArrowRightFromLineIcon,
  } from 'lucide-react';

// run an exporter plugin on the current experiment's model and adaptor 
function exportRun(
    experimentId: string,
    plugin: string
  ) {
    fetch(
      chatAPI.Endpoints.Experiment.RunExport(experimentId, plugin)
    );
  }

// fetcher used by SWR 
const fetcher = (url) => fetch(url).then((res) => res.json());

export default function Export({
    experimentInfo,
  }) {

    // fix this to find plugins that are exporters
    // let plugins = experimentInfo?.config?.plugins;
    // if (!plugins) plugins = [];

    // call plugins list endpoint and filter based on type="exporter" 
    const {
        data: plugins,
        error: pluginsError,
        isLoading: pluginsIsLoading,
      } = useSWR(
        experimentInfo?.id &&
          chatAPI.Endpoints.Experiment.ListScriptsOfType(
            experimentInfo?.id,
            'exporter'
          ),
        fetcher
      );

    return (
        <Sheet
      sx={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <Typography level="h1">Export Model</Typography>
      <Sheet sx={{ overflowY: 'auto', overflowX: 'hidden', mb: '2rem' }}>
        <Divider sx={{ mt: 2, mb: 2 }} />
        <Typography level="title-lg" mb={2}>
          Available Export Formats&nbsp;
        </Typography>
        {plugins?.length === 0 ? (
          <Typography level="title-lg" mb={1} color="warning">
            No Export Formats available, please install an export plugin.
          </Typography>
        ) : ( 
        <Table aria-label="basic table">
          <thead>
            <tr>
              <th>Exporter</th>
              <th>Description</th>
              <th style={{ textAlign: 'right' }}>&nbsp;</th>
            </tr>
          </thead>
          <tbody>
            {plugins?.map((row) => (
              <tr key={row.uniqueId}>
                <td>{row.name}</td>
                <td>{row.description}</td>
                <td style={{ textAlign: 'right' }}>
                      {' '}
                      <Button
                        startDecorator={<ArrowRightFromLineIcon />}
                        variant="soft"
                        onClick={() => {
                            exportRun(
                                experimentInfo.id,
                                row.uniqueId
                              );
                        }}
                      >
                        Export
                      </Button>
                    </td>
              </tr>
                )
            )}
          </tbody>
        </Table>
        )}
      </Sheet>
    </Sheet>
  );
  }