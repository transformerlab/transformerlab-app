import { FormEvent, useState } from 'react';
import {
  fetchWithAuth,
  useSWRWithAuth as useSWR,
} from 'renderer/lib/authContext';
import * as chatAPI from 'renderer/lib/transformerlab-api-sdk';

import {
  Box,
  Button,
  Checkbox,
  Chip,
  CircularProgress,
  Divider,
  FormControl,
  Input,
  Modal,
  ModalClose,
  ModalDialog,
  Sheet,
  Stack,
  Table,
  Typography,
} from '@mui/joy';

import {
  ArrowRightFromLineIcon,
  FolderXIcon,
  Link2Icon,
  UploadIcon,
} from 'lucide-react';

// fetcher used by SWR
import { fetcher } from '../../lib/transformerlab-api-sdk';

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
    isLoading,
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
        model_source === 'local'
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

  function prettyModelSourceName(source: string) {
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
      <ModalDialog
        sx={{
          width: 'min(980px, 95vw)',
          maxHeight: '90vh',
          overflow: 'hidden',
        }}
      >
        <ModalClose />
        <Typography level="h3" sx={{ mb: 0.5 }}>
          Import Models
        </Typography>
        <Typography level="body-sm" sx={{ color: 'text.tertiary', mb: 1 }}>
          Use quick single-file import or browse server folders.
        </Typography>

        <form
          id="import-models-form"
          style={{
            display: 'flex',
            flexDirection: 'column',
            height: '100%',
            gap: '14px',
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
          <Sheet
            variant="soft"
            sx={{
              p: 2,
              borderRadius: 'md',
              border: '1px solid',
              borderColor: 'divider',
            }}
          >
            <Stack spacing={1.5}>
              <Typography level="title-md">Quick Import</Typography>

              <FormControl>
                <Typography level="title-sm" sx={{ mb: 0.5 }}>
                  Upload single-file model
                </Typography>
                <Stack
                  direction={{ xs: 'column', md: 'row' }}
                  spacing={1}
                  alignItems={{ xs: 'stretch', md: 'center' }}
                >
                  <label htmlFor="singleModelUploadInput">
                    <Button
                      type="button"
                      component="span"
                      size="sm"
                      variant="outlined"
                    >
                      Choose file
                    </Button>
                  </label>
                  <Input
                    readOnly
                    value={
                      fileToUpload ? fileToUpload.name : 'No file selected'
                    }
                    sx={{ flex: 1, minWidth: 0 }}
                  />
                  <Button
                    type="button"
                    size="sm"
                    variant="solid"
                    startDecorator={
                      uploading ? (
                        <CircularProgress size="sm" />
                      ) : (
                        <UploadIcon size={16} />
                      )
                    }
                    disabled={
                      !fileToUpload || uploading || importing || importingUrl
                    }
                    onClick={uploadSingleFileModel}
                  >
                    {uploading ? 'Uploading...' : 'Upload & Import'}
                  </Button>
                </Stack>
                <Typography level="body-xs" sx={{ mt: 0.5 }}>
                  Supported: `.safetensors`, `.ckpt`, `.gguf`, `.ggml`
                </Typography>
                <input
                  style={{ display: 'none' }}
                  id="singleModelUploadInput"
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
              </FormControl>

              <FormControl>
                <Typography level="title-sm" sx={{ mb: 0.5 }}>
                  Import from URL
                </Typography>
                <Stack direction={{ xs: 'column', md: 'row' }} spacing={1}>
                  <Input
                    sx={{ flex: 1 }}
                    placeholder="https://.../model.safetensors"
                    value={modelUrl}
                    onChange={(event) => setModelUrl(event.target.value)}
                  />
                  <Button
                    type="button"
                    size="sm"
                    variant="solid"
                    startDecorator={
                      importingUrl ? (
                        <CircularProgress size="sm" />
                      ) : (
                        <Link2Icon size={16} />
                      )
                    }
                    disabled={
                      !modelUrl.trim() || uploading || importing || importingUrl
                    }
                    onClick={importSingleFileFromUrl}
                  >
                    {importingUrl ? 'Importing...' : 'Import URL'}
                  </Button>
                </Stack>
              </FormControl>
            </Stack>
          </Sheet>

          <Sheet
            variant="plain"
            sx={{
              p: 2,
              borderRadius: 'md',
              border: '1px solid',
              borderColor: 'divider',
              display: 'flex',
              flexDirection: 'column',
              gap: 1,
              flex: 1,
              minHeight: 0,
              overflow: 'hidden',
            }}
          >
            <Typography level="title-md">Browse Server Models</Typography>
            <Typography level="body-sm" sx={{ color: 'text.tertiary' }}>
              Pick a folder on the server and import detected models.
            </Typography>

            <FormControl>
              <Stack
                direction={{ xs: 'column', md: 'row' }}
                spacing={1}
                alignItems={{ xs: 'stretch', md: 'center' }}
              >
                <Input
                  type="text"
                  readOnly
                  value={modelFolder ? modelFolder.toString() : '(none)'}
                  sx={{ flex: 1 }}
                />
                <Stack direction="row" spacing={1}>
                  <label htmlFor="modelFolderSelector">
                    <Button
                      type="button"
                      component="span"
                      size="sm"
                      variant="outlined"
                    >
                      Select Folder
                    </Button>
                  </label>
                  {modelFolder && (
                    <Button
                      type="button"
                      size="sm"
                      variant="plain"
                      disabled={modelFolder === ''}
                      startDecorator={<FolderXIcon size={15} />}
                      onClick={() => setModelFolder('')}
                    >
                      Clear
                    </Button>
                  )}
                </Stack>
              </Stack>
              <input
                directory=""
                webkitdirectory=""
                style={{ display: 'none' }}
                type="file"
                id="modelFolderSelector"
                onChange={async (event: FormEvent<HTMLFormElement>) => {
                  // The input returns a list of files under the selected folder.
                  // NOT the folder. But you can infer folder using first file path.
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
            </FormControl>

            <Divider />

            <Box sx={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
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
                    <th style={{ width: 340, padding: 12 }}>Model ID</th>
                    <th style={{ width: 180, padding: 12 }}>Source</th>
                    <th style={{ width: 180, padding: 12 }}>Status</th>
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
                            level="body-sm"
                            fontWeight={row.supported ? 'lg' : 'sm'}
                          >
                            {row.id}
                          </Typography>
                        </td>
                        <td>
                          <Typography
                            ml={2}
                            level="body-sm"
                            fontWeight={row.supported ? 'lg' : 'sm'}
                          >
                            {prettyModelSourceName(row.source)}
                          </Typography>
                        </td>
                        <td>
                          <Chip
                            sx={{ ml: 2 }}
                            size="sm"
                            color={row.supported ? 'success' : 'danger'}
                            variant="soft"
                          >
                            {row.status}
                          </Chip>
                        </td>
                      </tr>
                    ))}
                  {!isLoading && !modelsError && models?.length === 0 && (
                    <tr>
                      <td colSpan={4}>
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
                      <td colSpan={4}>
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
                      <td colSpan={4}>
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
          </Sheet>

          <Stack spacing={2} direction="row" justifyContent="flex-end">
            <Button
              color="danger"
              variant="soft"
              disabled={importing || uploading || importingUrl}
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
            <Button
              variant="soft"
              type="submit"
              disabled={importing || isLoading || models?.length === 0}
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
