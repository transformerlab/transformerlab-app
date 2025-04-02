import React, { useEffect, useState } from 'react';
import useSWR from 'swr';


import {
  Box,
  Button,
  CircularProgress,
  Divider,
  Modal,
  ModalClose,
  ModalDialog,
  Sheet,
  Table,
  Typography,
} from '@mui/joy';
import { PlusCircleIcon, InfoIcon } from 'lucide-react';
import Dropzone from 'react-dropzone';
import { IoCloudUploadOutline } from 'react-icons/io5';

import * as chatAPI from '../../../lib/transformerlab-api-sdk';

const YAML = require('yaml');

const fetcher = (url) => fetch(url).then((res) => res.json());

export default function ImportRecipeModal({
  open,
  setOpen,
  mutate,
  experiment_id,
}) {
  const [uploading, setUploading] = useState(false);
  const [dropzoneActive, setDropzoneActive] = React.useState(false);

  const {
    data: recipesData,
    error: recipesError,
    isLoading: isLoading,
  } = useSWR(chatAPI.Endpoints.Recipes.Gallery(), fetcher);

  const recipes = recipesData;

  const {
    data: pluginsData,
    error: pluginsError,
    isLoading: pluginsLoading,
  } = useSWR(chatAPI.Endpoints.Plugins.List(), fetcher);

  const installedPlugins = pluginsData
    ? pluginsData.map((plugin) => plugin.uniqueId)
    : [];

  // For any variables that need to be reset on close
  const handleClose = () => {
    mutate();
    setOpen(false);
  };

  // Takes a file path, reads recipe data from it and then uploads reccipe text
  const uploadRecipeFile = async (file) => {
    // Read the recipe from the file so we can pass it as HTTP body
    const fullpath = file.path;
    const recipe_text = await fetch(`file://${fullpath}`)
      .then((res) => res.text())
      .catch((e) => {
        console.error(e);
        alert(e);
        return '';
      });
    if (!recipe_text) {
      handleClose();
      return;
    }

    // TODO: If the recipe has a name and there isn't a recipe with that name...
    // We should use the name in the recipe, not the filename!
    // const recipe_name = generateFriendlyName();
    // For now: Remove the last . and extension from the filename
    const recipe_name = file.name.replace(/\.[^/.]+$/, '');

    return uploadRecipe(recipe_name, recipe_text);
  };

  // Given a recipe string, uploads to API.
  const uploadRecipe = async (recipe_name: string, recipe_text: string) => {
    setUploading(true); //This is for the loading spinner
    const recipe = YAML.parse(recipe_text);
    const config = JSON.parse(recipe.training.config_json);
    // Adding these fields so we can get the model and dataset from the response and see if we need to download them
    config['_tlab_recipe_datasets'] = recipe.datasets;
    config['_tlab_recipe_models'] = recipe.model;
    const response = await createNewTask(
      recipe_name,
      recipe.training.plugin,
      experiment_id,
      JSON.stringify({
        model_name: recipe.model.name,
        model_architecture: config.model_architecture,
        dataset_name: recipe.datasets.name,
      }),
      JSON.stringify(config),
      '{}',
    );

    // Check if response has a data field
    const response_data = response.data;
    // If we have a response then recipe imported successfully.
    // Check if we need to download any assets so we can tell the user.
    if (response) {
      if (!response_data.model || !response_data.model.path) {
        alert('Warning: This recipe does not have an associated model');
      } else if (!response_data.dataset || !response_data.dataset.path) {
        alert('Warning: This recipe does not have an associated dataset');
      } else {
        let msg =
          'Warning: To use this recipe you will need to download the following:';
        let shouldDownload = false;

        if (!response_data.dataset.downloaded) {
          msg += '\n- Dataset: ' + response_data.dataset.path;
          shouldDownload = true;
        }
        if (!response_data.model.downloaded) {
          msg += '\n- Model: ' + response_data.model.path;
          shouldDownload = true;
        }

        if (shouldDownload) {
          msg += '\n\nDo you want to download these now?';
          if (confirm(msg)) {
            // Use confirm() to get Accept/Cancel
            if (!response_data.dataset.downloaded) {
              fetch(chatAPI.Endpoints.Dataset.Download(response_data.dataset.path))
                .then((response) => {
                  if (!response.ok) {
                    console.log(response);
                    throw new Error(`HTTP Status: ${response.status}`);
                  }
                  return response.json();
                })
                .catch((error) => {
                  alert('Dataset download failed:\n' + error);
                });
            }
            if (!response_data.model.downloaded) {
              chatAPI
                .downloadModelFromHuggingFace(response_data.model.path)
                .then((response) => {
                  if (response.status == 'error') {
                    console.log(response);
                    throw new Error(`${response.message}`);
                  }
                  return response;
                })
                .catch((error) => {
                  alert('Model download failed:\n' + error);
                });
            }
          } else {
            // User pressed Cancel
            alert('Downloads cancelled. This recipe might not work correctly.');
          }
        }
      }
    }

    setUploading(false);
    handleClose();
  };

  async function createNewTask(
    name: string,
    plugin: string,
    experimentId: string,
    inputs: string,
    config: string,
    outputs: string,
  ) {
    const configBody = {
      name: name,
      plugin: plugin,
      experiment_id: experimentId,
      inputs: inputs,
      config: config,
      outputs: outputs,
      type: 'TRAIN',
    };
    console.log(configBody);
    const response = await fetch(chatAPI.Endpoints.Tasks.NewTask(), {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        accept: 'application/json',
      },
      body: JSON.stringify(configBody),
    });
    const result = await response.json();
    return result;
  }

  return (
    <>
      <Modal open={open} onClose={handleClose}>
        <ModalDialog>
          <ModalClose />
          <Typography level="title-lg">Recipe Gallery</Typography>

          <Box sx={{ maxHeight: '450px', overflow: 'auto' }}>
            <Table
              aria-labelledby="tableTitle"
              stickyHeader
              hoverRow
              sx={{
                '--TableCell-headBackground': (theme) =>
                  theme.vars.palette.background.level1,
                '--Table-headerUnderlineThickness': '1px',
                '--TableRow-hoverBackground': (theme) =>
                  theme.vars.palette.background.level1,
                height: '100px',
                overflow: 'auto',
              }}
            >
              <thead>
                <tr>
                  <th style={{ width: 180, padding: 10 }}>Name</th>
                  <th style={{ width: 150, padding: 10 }}>Plugin</th>
                  <th style={{ width: 220, padding: 10 }}>Dataset</th>
                  <th style={{ width: 35, padding: 10 }}> </th>
                  <th style={{ width: 60, padding: 10 }}> </th>
                </tr>
              </thead>
              <tbody>
                {!isLoading &&
                  recipes &&
                  recipes.map((row) => (
                    <tr key={row.metadata?.name}>
                      <td>
                        <Typography fontWeight="lg">
                          {row.metadata?.name}
                        </Typography>
                      </td>
                      <td>
                        <Typography
                          fontWeight="sm"
                          style={{ overflow: 'hidden' }}
                        >
                          {row.training?.plugin}
                        </Typography>
                      </td>
                      <td>
                        <Typography
                          fontWeight="sm"
                          style={{ overflow: 'hidden' }}
                        >
                          {row.datasets?.name}
                        </Typography>
                      </td>
                      <td>
                        <InfoIcon
                          size="28px"
                          color="var(--joy-palette-neutral-400)"
                          onClick={() => {
                            alert(row.metadata?.description);
                          }}
                        />
                      </td>
                      <td>
                        <Button
                          size="sm"
                          disabled={
                            !installedPlugins.includes(row.training?.plugin)
                          }
                          onClick={() => {
                            const recipe_text = YAML.stringify(row);
                            uploadRecipe(row.metadata?.name, recipe_text);
                          }}
                        >
                          Use
                        </Button>
                      </td>
                    </tr>
                  ))}
                {isLoading && (
                  <tr>
                    <td colSpan={5}>
                      <CircularProgress color="primary" />
                      <Typography
                        level="body-lg"
                        justifyContent="center"
                        margin={5}
                      >
                        Loading recipes...
                      </Typography>
                    </td>
                  </tr>
                )}
              </tbody>
            </Table>
          </Box>

          <Divider sx={{ my: 2 }} />

          <Typography level="title-lg"></Typography>
          <Box // Making the modal a set size
            sx={{
              display: 'flex',
              flexDirection: 'column',
              gap: 2,
              overflowY: 'hidden',
              justifyContent: 'center',
            }}
          >
            <Dropzone
              onDrop={async (acceptedFiles) => {
                setDropzoneActive(false);
                for (const file of acceptedFiles) {
                  await uploadRecipeFile(file);
                }
              }}
              onDragEnter={() => {
                setDropzoneActive(true);
              }}
              onDragLeave={() => {
                setDropzoneActive(false);
              }}
              noClick
            >
              {({ getRootProps, getInputProps }) => (
                <div id="dropzone_baby" {...getRootProps()}>
                  <Sheet
                    color="primary"
                    variant="soft"
                    sx={{
                      display: 'flex',
                      flexDirection: 'column',
                      marginBottom: '0rem',
                      overflow: 'hidden',
                      minHeight: '130px',
                      border: dropzoneActive
                        ? '2px solid var(--joy-palette-warning-400)'
                        : '2px dashed var(--joy-palette-neutral-300)',
                      borderRadius: '8px',
                      flex: 1,
                      justifyContent: 'center',
                      alignItems: 'center',
                      color: 'var(--joy-palette-neutral-400)',
                    }}
                  >
                    <IoCloudUploadOutline size="36px" /> Drag files here
                    <Typography level="body-xs" color="neutral" mt={3}>
                      Allowed filetypes: .yaml
                    </Typography>
                  </Sheet>
                </div>
              )}
            </Dropzone>
            <Button
              startDecorator={<PlusCircleIcon />}
              onClick={() => {
                var input = document.createElement('input');
                input.type = 'file';
                input.multiple = false; // Don't allow multiple files
                input.accept = '.yaml'; //Only allow YAML files

                input.onchange = async (e) => {
                  let files = Array.from(input.files);
                  for (const file of files) {
                    await uploadRecipeFile(file);
                  }
                };
                input.click();
              }}
              disabled={uploading}
            >
              {uploading ? <CircularProgress /> : 'Select file'}
            </Button>
          </Box>
        </ModalDialog>
      </Modal>
    </>
  );
}
