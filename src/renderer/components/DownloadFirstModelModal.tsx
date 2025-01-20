import { useState } from 'react';

import {
  Button,
  DialogTitle,
  Modal,
  ModalClose,
  ModalDialog,
  Stack,
  Table,
  Typography,
} from '@mui/joy';

import {
    BoxesIcon,
  } from 'lucide-react';

import {
    formatBytes,
} from '../lib/utils';
import DownloadProgressBox from './Shared/DownloadProgressBox';
import * as chatAPI from '../lib/transformerlab-api-sdk';

function recommendedStartingModel(cpu : string, os : string, device : string) {
  
    if (cpu == 'arm64' && os == 'Darwin') {
        return {
            id: 'mlx-community/Llama-3.2-1B-Instruct-4bit',
            name: "Llama 3.2 1B Instruct (MLX 4bit)",
            size_of_model_in_mb: 671.82
        };
    }
  
    if (device == 'cuda') {
        return {
            id: 'unsloth/Llama-3.2-1B-Instruct',
            name: "Llama 3.2 1B Instruct",
            size_of_model_in_mb: 2365.86
          }
    }
  
    // Default recommendation model
    return {
        id: 'bartowski/Llama-3.2-1B-Instruct-GGUF/Llama-3.2-1B-Instruct-Q6_K.gguf',
        name: "LLama 3.2 1B Instruct GGUF - Q6_K",
        size_of_model_in_mb: 1044
      }
  }
  
  function typeOfComputer(cpu : string, os : string, device : string) {
    if (!cpu || !os || !device) return 'Unknown architecture';
  
    if (cpu == 'arm64' && os == 'Darwin') {
      return 'Apple Silicon Mac';
    }
  
    return `${cpu} based ${os} computer with ${device} support`;
  }

export default function DownloadFirstModelModal({ open, setOpen, server }) {
  const [currentlyDownloading, setCurrentlyDownloading] = useState(null);
  const [jobId, setJobId] = useState(null);

  const cpu = server?.cpu;
  const os = server?.os;
  const device = server?.device;
  const recommended_model = recommendedStartingModel(cpu, os, device);

  // Track selected model
  const [selectedModel, setSelectedModel] = useState(recommended_model.id);
  const onOptionChange = e => {
    setSelectedModel(e.target.value);
  }

  return (
    <Modal open={open} onClose={() => setOpen(false)}>
      <ModalDialog sx={{ gap: 0 }}>
        <DialogTitle>Download your first language model!</DialogTitle>
        <ModalClose variant="plain" sx={{ m: 1 }} />
        <hr />
        <Stack>
          <Typography level="body-sm">
            You need a foundation model to build with Transformer Lab.
          </Typography>
          <Typography level="body-sm">
            We recommend starting with one of the following small models.
            You can also skip this and go to the <BoxesIcon size="12px" />{' '}
            <b>Model Zoo</b> where you can download your own model, 
            or import from elsewhere on your system.
          </Typography>
          <hr />
          <Typography level="body-lg" sx={{ fontSize: '20px' }}>
            <b>Recommended Starting Models</b>
          </Typography>
          <Table
            sx={{
              ['&.MuiTable-root']: {
                paddingBottom: '16px', 
                borderCollapse: 'separate'
              }
            }}
          >
            <tr>
              <td>
                <input
                  type="radio"
                  name="download_initial_model"
                  value={recommended_model.id}
                  onChange={onOptionChange}
                  defaultChecked
                />
                <b>{recommended_model.name} (<i>recommended</i>)</b>
                <Typography level="body-sm" textColor="text.tertiary">
                    A great starting model for your machine's capabilities.
                    ({formatBytes(recommended_model.size_of_model_in_mb*1024*1024)})
                </Typography>
              </td>
            </tr>
            <tr>
              <td>
                <input
                  type="radio"
                  name="download_initial_model"
                  value="TinyLlama/TinyLlama-1.1B-Chat-v1.0"
                  onChange={onOptionChange}
                />
                <b>Tiny Llama 1.1B Chat</b>
                <Typography level="body-sm" textColor="text.tertiary">
                    A popular small model based on Llama architecture. (2.05GB)
                </Typography>
              </td>
            </tr>
            <tr>
              <td>
                <input
                  type="radio"
                  name="download_initial_model"
                  value="Qwen/Qwen2.5-1.5B-Instruct"
                  onChange={onOptionChange}
                />
                <b>Qwen2.5-1.5B-Instruct</b>
                <Typography level="body-sm" textColor="text.tertiary">
                    A slightly larger model with better performance. (~3GB)
                </Typography>
              </td>
            </tr>
          </Table>

          {currentlyDownloading && <DownloadProgressBox
            jobId={jobId}
            assetName={currentlyDownloading}
          />}

          <Button
            color="neutral"
            startDecorator={null}
            disabled={
                currentlyDownloading != null
              }
            onClick={async () => {
                setCurrentlyDownloading(selectedModel);
                setJobId(-1);

                // Create a new job and record the ID of the job so we can track download progress
                const job_response = await fetch(
                  chatAPI.Endpoints.Jobs.Create()
                );
                const newJobId = await job_response.json();
                setJobId(newJobId);

                // Try downloading the model
                const response = await chatAPI.downloadModelFromGallery(selectedModel, newJobId);
                if (response?.status == 'error') {
                    alert('Download failed!\n' + response.message);
                }

                // download complete
                setCurrentlyDownloading(null);
                setOpen(false);
            }}
          >
            {currentlyDownloading ? 'Downloading' : 'Download selected model'}
          </Button>
          <Button
            variant="plain"
            onClick={() => setOpen(false)}
          >
            {currentlyDownloading ? 'Continue without waiting' : 'Skip for now'}
          </Button>
        </Stack>
      </ModalDialog>
    </Modal>
  );
}