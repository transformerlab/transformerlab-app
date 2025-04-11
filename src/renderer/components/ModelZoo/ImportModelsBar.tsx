import { useState } from 'react';

import {
  Button,
  FormControl,
  Input,
  Box,
  CircularProgress,
} from '@mui/joy';

import { PlusIcon } from 'lucide-react';

import * as chatAPI from '../../lib/transformerlab-api-sdk';
import ImportModelsModal from './ImportModelsModal';

// Needs to share jobId with ModelsStore
// If you start a download on one it should stop you from starting on the other
// Also this is how the import bar tells teh model store to show a download progress bar
export default function ImportModelsBar({ jobId, setJobId }) {
  const [importModelsModalOpen, setImportModelsModalOpen] = useState(false);

  return (
    <>
      <ImportModelsModal
        open={importModelsModalOpen}
        setOpen={setImportModelsModalOpen}
      />

      <Box
        sx={{
          justifyContent: 'space-between',
          display: 'flex',
          width: '100%',
          paddingTop: '12px',
          flex: 1,
          alignSelf: 'flex-end',
        }}
      >

        <div
          style={{
            width: '100%',
            alignSelf: 'flex-end',
            display: 'flex',
            flexDirection: 'row',
            justifyContent: 'space-between',
          }}
        >
          <FormControl>
            <Input
              placeholder="decapoda-research/llama-30b-hf"
              name="download-model-name"
              endDecorator={
                <Button
                  onClick={async (e) => {
                    const model = document.getElementsByName('download-model-name')[0].value;

                    // only download if valid model is entered
                    if (model) {
                      setJobId(-1);
                      try {

                        const jobResponse = await fetch(
                          chatAPI.Endpoints.Jobs.Create()
                        );
                        const newJobId = await jobResponse.json();
                        setJobId(newJobId);

                        // Try downloading the model
                        const response = await chatAPI.downloadModelFromHuggingFace(
                          model,
                          newJobId
                        );
                        console.log(response);
                        if (response?.status == 'error' || response?.status == 'unauthorized') {
                          alert('Download failed!\n' + response.message);
                        }

                        // download complete
                        setJobId(null);

                      } catch (e) {
                        setJobId(null);
                        console.log(e);
                        return alert('Failed to download');
                      }
                    }
                  }}
                  startDecorator={
                    jobId ? (
                      <CircularProgress size="sm" thickness={2} />
                    ) : (
                      ""
                    )}
                >
                  {jobId ? (
                    "Downloading"
                  ) : (
                    "Download 🤗 Model"
                  )}
                </Button>
              }
              sx={{ width: '500px' }}
              disabled={jobId != null}
            />
          </FormControl>
          <Button
            size="sm"
            sx={{ height: '30px' }}
            endDecorator={<PlusIcon />}
            onClick={() => {
              setImportModelsModalOpen(true);
            }}
          >
            Import Local Models
          </Button>
        </div>
      </Box>
    </>
  );
}