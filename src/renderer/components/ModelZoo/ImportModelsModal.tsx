import { useState } from 'react';
import useSWR from 'swr';
import * as chatAPI from 'renderer/lib/transformerlab-api-sdk';

import { 
    Button, 
    Checkbox,
    CircularProgress,
    FormControl,
    FormLabel,
    Modal, 
    ModalClose, 
    ModalDialog, 
    Stack,
    Table,
    Typography
} from '@mui/joy';

import {
    ArrowRightFromLineIcon
} from 'lucide-react';

// fetcher used by SWR
const fetcher = (url) => fetch(url).then((res) => res.json());

export default function ImportModelsModal({ open, setOpen}) {
    const [importing, setImporting] = useState(false);
    const [modelFolder, setModelFolder] = useState(null);

    const {
        data: modelsData,
        error: modelsError,
        isLoading: isLoading,
    } = useSWR(
        chatAPI.Endpoints.Models.GetLocalUninstalled(),
        fetcher
    );
    const models = modelsData?.data;

    // model_ids is an iterator
    async function importRun(model_ids: Iterator) {
        let next = model_ids.next();
        while(!next.done) {
            // In the iterator, each iteam is a key (model_id) and a value (blank)
            // this is just how it gets produced from the form
            const model_id = next.value[0];
            console.log("Importing " + model_id);
            await fetch(
              chatAPI.Endpoints.Models.ImportFromHFCache(model_id)
            );
            next = model_ids.next();
        }
        return;
    }

    function prettyModelSourceName(source: str) {
        switch(source) {
          case "huggingface":
            return "Hugging Face"
          case "ollama":
            return "Ollama"
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

            {/*
            <FormControl>
              <Typography>
                <b>Search Local Directory: </b>
                <input
                  type="text"
                  size="50"
                  for="modelFolderSelector"
                  class="btn"
                  value={modelFolder ? modelFolder.toString() : "(none)"}
                />
              </Typography>
                <input
                  directory=""
                  webkitdirectory=""
                  type="file"
                  id="modelFolderSelector"
                  onChange={async (event: FormEvent<HTMLFormElement>) => {

                    // The input returns a list of files under the selected folder.
                    // NOT the folder. But you can figure out the folder based on
                    // the difference between path and webkitRelativePath.
                    const filelist: FileList | null = event.target.files;
                    if (filelist && filelist.length > 0 ) {
                      const firstfile = filelist[0];
                      const firstfilepath = firstfile.path;
                      const webkitRelativePath = firstfile.webkitRelativePath;
                      const parentPath = firstfilepath.slice(0, -1*webkitRelativePath.length)
                      setModelFolder(parentPath);
                    } else {
                      setModelFolder(null);
                    }
                }}
                />
              <br />
            </FormControl>
            */}

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
                  <th style={{ width: 20, padding: 12 }}> </th>
                  <th style={{ width: 175, padding: 12 }}>Model ID</th>
                  <th style={{ width: 100, padding: 12 }}>Source</th>
                  <th style={{ width: 120, padding: 12 }}>Architecture</th>
                  <th style={{ width: 75, padding: 12 }}>Supported</th>
                </tr>
              </thead>
              <tbody>
                {!isLoading && models?.length > 0 && models.map((row) => (
                <tr key={row.id}>
                  <td>
                  <Typography ml={2} fontWeight="lg">
                    {row.installed
                        ? " "
                        : (row.supported 
                            ? <Checkbox name={row.id} defaultChecked />
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
                        {row.architecture}
                    </Typography>
                  </td>
                  <td>
                    <Typography ml={2} fontWeight={row.supported ? "lg" : "sm"}>
                        {row.supported ? "Yes" : "No"}
                    </Typography>
                  </td>
                </tr>
              ))}
              {!isLoading && models?.length === 0 && (
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
                    <CircularProgress color="primary" /> 
                    <Typography
                        level="body-lg"
                        justifyContent="center"
                        margin={5}
                    >
                      Scanning for models...
                  </Typography>
                  </td>
                </tr>
              )}
              </tbody>
            </Table>

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
                    disabled={models?.length==0 && importing}
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