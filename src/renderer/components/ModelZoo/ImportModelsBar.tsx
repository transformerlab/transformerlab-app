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

export default function ModelDetails({}) {
    const [downloadingModel, setDownloadingModel] = useState(null);
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
                        // this triggers UI changes while download is in progress
                        setDownloadingModel(model);

                        // Try downloading the model
                        const response = await chatAPI.downloadModelFromHuggingFace(model);
                        if (response?.status == 'error') {
                          alert('Download failed!\n' + response.message);
                        }

                        // download complete
                        setDownloadingModel(null);
                      }
                    }}
                startDecorator={
                  downloadingModel ? (
                    <CircularProgress size="sm" thickness={2} />
                  ) : (
                    ""
                  )}
                  >
                  {downloadingModel ? (
                    "Downloading"
                  ) : (
                    "Download 🤗 Model"
                  )}
                  </Button>
                }
                sx={{ width: '500px' }}
                disabled={downloadingModel}
              />
            </FormControl>
            <Button
              size="sm"
              sx={{ height: '30px' }}
              disabled={process.env.NODE_ENV != "development"}
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