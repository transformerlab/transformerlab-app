import { useState } from 'react';
import useSWR from 'swr';
import * as chatAPI from 'renderer/lib/transformerlab-api-sdk';

import {
  Box,
  Button,
  Checkbox,
  CircularProgress,
  FormControl,
  Input,
  Modal,
  ModalClose,
  ModalDialog,
  Stack,
  Table,
  Typography
} from '@mui/joy';

import {
  ArrowRightFromLineIcon,
  FolderXIcon,
  FolderPlusIcon
} from 'lucide-react';

// fetcher used by SWR
const fetcher = (url) => fetch(url).then((res) => res.json());

export default function ImportModelsModal({ open, setOpen }) {
  const [importing, setImporting] = useState(false);
  const [modelFolder, setModelFolder] = useState("");

  const {
    data: modelsData,
    error: modelsError,
    isLoading: isLoading,
  } = useSWR(
    !open
      ? null
      : chatAPI.Endpoints.Models.SearchForLocalUninstalledModels(modelFolder),
    fetcher
  );
  const models = modelsData?.data;

  /*
   * This funciton takes an Iterator with model information and tries to import 
   * each of those models through individual calls to the backend.
   *
   * When it completes it displays an alert with results.
   */
  async function importRun(model_ids: Iterator) {

    // storing results
    let totalImports = 0;
    let successfulImports = 0;
    let error_msg = "";

    let next = model_ids.next();
    while (!next.done) {
      // In the iterator, each item is a key (model_id) and a value (model_source)
      // this is just how it gets produced from the form
      const model_id = next.value[0];
      const model_source = next.value[1];

      console.log("Importing " + model_id);
      const api_endpoint = model_source == "local"
        ? chatAPI.Endpoints.Models.ImportFromLocalPath(model_id)
        : chatAPI.Endpoints.Models.ImportFromSource(model_source, model_id);
      const response = await fetch(api_endpoint);

      // Read the response to see if it was successful and report any errors
      let response_error = "";
      if (response.ok) {
        const response_json = await response.json();
        if (response_json.status == "success") {
          successfulImports++;
        } else if ("message" in response_json) {
          response_error = response_json.message;
        } else {
          response_error = "Unspecified error";
        }
      } else {
        response_error = "API error";
      }

      // Log errors
      if (response_error) {
        const new_error = `${model_id}: ${response_error}`;
        console.log(new_error);
        error_msg += `${new_error}\n`;
      }
      totalImports++;
      next = model_ids.next();
    }

    const result_msg = `${successfulImports} of ${totalImports} models imported.`;
    console.log(result_msg);
    if (error_msg) {
      alert(`${result_msg}\n\nErrors:\n${error_msg}`);
    } else {
      alert(result_msg);
    }
    return;
  }

  function prettyModelSourceName(source: str) {
    switch (source) {
      case "huggingface":
        return "Hugging Face"
      case "ollama":
        return "Ollama"
      case "local":
        return "Local Folder"
      default:
        return source;
    }
  }

  return (
    <Modal open={open} onClose={() => setOpen(false)}>
      <ModalDialog>
        <ModalClose />
        <Typography level="h3">Select models to import:</Typography>
        <form
          id="import-models-form"
          style={{
            display: 'flex',
            flexDirection: 'column',
            height: '100%',
            justifyContent: 'space-between',
          }}
          onSubmit={async (event: FormEvent<HTMLFormElement>) => {
            event.preventDefault();
            setImporting(true);
            const form_data = new FormData(event.currentTarget);
            const model_ids = (form_data as any).entries();

            // model_ids is an interator with a list of model IDs to import
            await importRun(model_ids);
            setImporting(false);
            setOpen(false);
          }}
        >

          {
            <FormControl>
              <Typography>
                <b>Search Local Directory: </b>
              </Typography>
              <div>
                <Input
                  type="text"
                  size="40"
                  for="modelFolderSelector"
                  class="btn"
                  readOnly
                  sx={{ width: '85%', float: 'left' }}
                  value={modelFolder ? modelFolder.toString() : "(none)"}
                />
                {modelFolder
                  ? <Button
                    size="sm"
                    sx={{ height: '30px' }}
                    variant="plain"
                    disabled={modelFolder == ""}
                    startDecorator={<FolderXIcon />}
                    onClick={() => setModelFolder("")}
                  />
                  : <Button
                    size="sm"
                    sx={{ height: '30px' }}
                    variant="plain"
                    disabled={modelFolder}
                    startDecorator={<FolderPlusIcon />}
                  />
                }
              </div>
              <div>
                <input
                  directory=""
                  webkitdirectory=""
                  type="file"
                  id="modelFolderSelector"
                  onChange={async (event: FormEvent<HTMLFormElement>) => {

                    // The input returns a list of files under the selected folder.
                    // NOT the folder. But you can figure out the folder based on
                    // the difference between path and webkitRelativePath.
                    // The path we want includes the first directory in webkitRelativePath.
                    const filelist: FileList | null = event.target.files;
                    if (filelist && filelist.length > 0) {
                      const firstfile = filelist[0];
                      const firstfilepath = firstfile.path;
                      const webkitRelativePath = firstfile.webkitRelativePath;
                      const parentPath = firstfilepath.slice(0, -1 * webkitRelativePath.length);
                      const topRelativePathDir = webkitRelativePath.split('/')[0];
                      const fullPath = parentPath + topRelativePathDir;
                      setModelFolder(fullPath);
                    } else {
                      setModelFolder("");
                    }
                  }}
                />
              </div>
              <br />
            </FormControl>
          }

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
                  <th style={{ width: 40, maxWidth: 40, padding: 12 }}> </th>
                  <th style={{ width: 175, padding: 12 }}>Model ID</th>
                  <th style={{ width: 100, padding: 12 }}>Source</th>
                  <th style={{ width: 150, padding: 12 }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {!isLoading && !modelsError && models?.length > 0 && models.map((row) => (
                  <tr key={row.id}>
                    <td>
                      <Typography ml={2} fontWeight="lg">
                        {row.installed
                          ? " "
                          : (row.supported
                            ? <Checkbox
                              name={row.path}
                              value={row.source}
                              defaultChecked
                            />
                            : <Checkbox disabled />
                          )
                        }
                      </Typography>
                    </td>
                    <td>
                      <Typography ml={2} fontWeight={row.supported ? "lg" : "sm"}>
                        {row.id}
                      </Typography>
                    </td>
                    <td>
                      <Typography ml={2} fontWeight={row.supported ? "lg" : "sm"}>
                        {prettyModelSourceName(row.source)}
                      </Typography>
                    </td>
                    <td>
                      <Typography ml={2} fontWeight={row.supported ? "lg" : "sm"}>
                        {row.status}
                      </Typography>
                    </td>
                  </tr>
                ))}
                {!isLoading && !modelsError && models?.length === 0 && (
                  <tr>
                    <td colSpan={5}>
                      <Typography
                        level="body-lg"
                        justifyContent="center"
                        margin={5}
                      >
                        No new models found.
                      </Typography>
                    </td>
                  </tr>
                )}
                {isLoading && (
                  <tr>
                    <td colSpan={5}>
                      <Typography
                        level="body-lg"
                        justifyContent="center"
                        margin={5}
                      >
                        <CircularProgress color="primary" />
                        Scanning for models...
                      </Typography>
                    </td>
                  </tr>
                )}
                {modelsError && (
                  <tr>
                    <td colSpan={5}>
                      <Typography
                        level="body-lg"
                        justifyContent="center"
                        margin={5}
                      >
                        Error scanning for models.
                      </Typography>
                    </td>
                  </tr>
                )}
              </tbody>
            </Table>
          </Box>

          <Stack spacing={2} direction="row" justifyContent="flex-end">
            <Button
              color="danger"
              variant="soft"
              disabled={importing}
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
            <Button
              variant="soft"
              type="submit"
              disabled={models?.length == 0 && importing}
              startDecorator={
                importing
                  ? <CircularProgress />
                  : <ArrowRightFromLineIcon />
              }
            >
              Import
            </Button>
          </Stack>

        </form>
      </ModalDialog>
    </Modal>
  )
}