import { FormEvent, useState } from 'react';
import { useSWRWithAuth as useSWR } from 'renderer/lib/authContext';
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
  Typography,
} from '@mui/joy';

import { ArrowRightFromLineIcon, FolderXIcon, Link2Icon, UploadIcon } from 'lucide-react';

// fetcher used by SWR
import { fetcher } from '../../lib/transformerlab-api-sdk';
import { fetchWithAuth } from 'renderer/lib/authContext';

export default function ImportModelsModal({ open, setOpen }) {
  const [importing, setImporting] = useState(false);
  const [modelFolder, setModelFolder] = useState('');
  const [uploading, setUploading] = useState(false);
  const [fileToUpload, setFileToUpload] = useState<File | null>(null);
  const [importingUrl, setImportingUrl] = useState(false);
  const [modelUrl, setModelUrl] = useState('');

  const {
    data: modelsData,
    error: modelsError,
    isLoading: isLoading,
  } = useSWR(
    !open
      ? null
      : chatAPI.Endpoints.Models.SearchForLocalUninstalledModels(modelFolder),
    fetcher,
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
    let error_msg = '';

    let next = model_ids.next();
    while (!next.done) {
      // In the iterator, each item is a key (model_id) and a value (model_source)
      // this is just how it gets produced from the form
      const model_id = next.value[0];
      const model_source = next.value[1];

      console.log('Importing ' + model_id);
      const api_endpoint =
        model_source == 'local'
          ? chatAPI.Endpoints.Models.ImportFromLocalPath(model_id)
          : chatAPI.Endpoints.Models.ImportFromSource(model_source, model_id);
      const response = await fetchWithAuth(api_endpoint);

      // Read the response to see if it was successful and report any errors
      let response_error = '';
      if (response.ok) {
        const response_json = await response.json();
        if (response_json.status == 'success') {
          successfulImports++;
        } else if ('message' in response_json) {
          response_error = response_json.message;
        } else {
          response_error = 'Unspecified error';
        }
      } else {
        response_error = 'API error';
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

  async function uploadSingleFileModel() {
    if (!fileToUpload) {
      alert('Select a .safetensors or .ckpt file first.');
      return;
    }

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', fileToUpload);

      const response = await fetchWithAuth(
        chatAPI.Endpoints.Models.UploadSingleFile(),
        {
          method: 'POST',
          body: formData,
        },
      );

      const result = await response.json();
      if (response.ok && result?.status === 'success') {
        alert(`Model imported: ${result.data}`);
        setFileToUpload(null);
        setOpen(false);
      } else {
        alert(result?.message || 'Failed to upload and import model.');
      }
    } catch (e) {
      alert(`Upload failed: ${e}`);
    } finally {
      setUploading(false);
    }
  }

  async function importSingleFileFromUrl() {
    const url = modelUrl.trim();
    if (!url) {
      alert('Enter a model URL first.');
      return;
    }

    setImportingUrl(true);
    try {
      const response = await fetchWithAuth(
        chatAPI.Endpoints.Models.ImportSingleFileFromUrl(),
        {
          method: 'POST',
          body: JSON.stringify({ model_url: url }),
        },
      );

      const result = await response.json();
      if (response.ok && result?.status === 'success') {
        alert(`Model imported: ${result.data}`);
        setModelUrl('');
        setOpen(false);
      } else {
        alert(result?.message || 'Failed to import model from URL.');
      }
    } catch (e) {
      alert(`URL import failed: ${e}`);
    } finally {
      setImportingUrl(false);
    }
  }

  function prettyModelSourceName(source: str) {
    switch (source) {
      case 'huggingface':
        return 'Hugging Face';
      case 'ollama':
        return 'Ollama';
      case 'local':
        return 'Local Folder';
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
          <FormControl>
            <Typography>
              <b>Upload Single-File Model (.safetensors/.ckpt): </b>
            </Typography>
            <Stack direction="row" spacing={1}>
              <input
                type="file"
                accept=".safetensors,.ckpt,.gguf,.ggml"
                onChange={(event: FormEvent<HTMLFormElement>) => {
                  const input = event.target as HTMLInputElement;
                  const selectedFile =
                    input.files && input.files.length > 0
                      ? input.files[0]
                      : null;
                  setFileToUpload(selectedFile);
                }}
              />
              <Button
                type="button"
                size="sm"
                variant="outlined"
                startDecorator={
                  uploading ? <CircularProgress size="sm" /> : <UploadIcon />
                }
                disabled={!fileToUpload || uploading || importing || importingUrl}
                onClick={uploadSingleFileModel}
              >
                {uploading ? 'Uploading...' : 'Upload & Import'}
              </Button>
            </Stack>
          </FormControl>

          <FormControl>
            <Typography>
              <b>Import Single-File Model from URL: </b>
            </Typography>
            <Stack direction="row" spacing={1}>
              <Input
                placeholder="https://.../model.safetensors"
                value={modelUrl}
                onChange={(event) => setModelUrl(event.target.value)}
              />
              <Button
                type="button"
                size="sm"
                variant="outlined"
                startDecorator={
                  importingUrl ? (
                    <CircularProgress size="sm" />
                  ) : (
                    <Link2Icon size={16} />
                  )
                }
                disabled={!modelUrl.trim() || uploading || importing || importingUrl}
                onClick={importSingleFileFromUrl}
              >
                {importingUrl ? 'Importing...' : 'Import URL'}
              </Button>
            </Stack>
          </FormControl>

          <FormControl>
            <Typography>
              <b>Search Local Directory (Server Path): </b>
            </Typography>
            <div>
              <Input
                type="text"
                size="40"
                for="modelFolderSelector"
                class="btn"
                readOnly
                sx={{ width: '85%', float: 'left' }}
                value={modelFolder ? modelFolder.toString() : '(none)'}
              />
              {modelFolder && (
                <Button
                  size="sm"
                  sx={{ height: '30px' }}
                  variant="plain"
                  disabled={modelFolder == ''}
                  startDecorator={<FolderXIcon />}
                  onClick={() => setModelFolder('')}
                />
              )}
            </div>
            <div>
              <label htmlFor="modelFolderSelector">
                <Button
                  component="span"
                  size="sm"
                  sx={{ height: '30px' }}
                  variant="outlined"
                >
                  Select Folder
                </Button>
              </label>
              <input
                directory=""
                webkitdirectory=""
                style={{ display: 'none' }}
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
                    const parentPath = firstfilepath.slice(
                      0,
                      -1 * webkitRelativePath.length,
                    );
                    const topRelativePathDir = webkitRelativePath.split('/')[0];
                    const fullPath = parentPath + topRelativePathDir;
                    setModelFolder(fullPath);
                  } else {
                    setModelFolder('');
                  }
                }}
              />
            </div>
            <br />
          </FormControl>

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
                {!isLoading &&
                  !modelsError &&
                  models?.length > 0 &&
                  models.map((row) => (
                    <tr key={row.id}>
                      <td>
                        <Typography ml={2} fontWeight="lg">
                          {row.installed ? (
                            ' '
                          ) : row.supported ? (
                            <Checkbox
                              name={row.path}
                              value={row.source}
                              defaultChecked
                            />
                          ) : (
                            <Checkbox disabled />
                          )}
                        </Typography>
                      </td>
                      <td>
                        <Typography
                          ml={2}
                          fontWeight={row.supported ? 'lg' : 'sm'}
                        >
                          {row.id}
                        </Typography>
                      </td>
                      <td>
                        <Typography
                          ml={2}
                          fontWeight={row.supported ? 'lg' : 'sm'}
                        >
                          {prettyModelSourceName(row.source)}
                        </Typography>
                      </td>
                      <td>
                        <Typography
                          ml={2}
                          fontWeight={row.supported ? 'lg' : 'sm'}
                        >
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
              disabled={importing || isLoading || models?.length == 0}
              startDecorator={
                importing ? <CircularProgress /> : <ArrowRightFromLineIcon />
              }
            >
              Import
            </Button>
          </Stack>
        </form>
      </ModalDialog>
    </Modal>
  );
}
