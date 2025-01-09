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
            id: 'TinyLlama/TinyLlama-1.1B-Chat-v1.0',
            name: "Tiny Llama 1.1B Chat",
            size_of_model_in_mb: 2100.43
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

export default function GettingStartedModal({ open, setOpen, server }) {
  const [currentlyDownloading, setCurrentlyDownloading] = useState(null);

  const cpu = server?.cpu;
  const os = server?.os;
  const device = server?.device;

  const recommended_model = recommendedStartingModel(cpu, os, device);

  return (
    <Modal open={open} onClose={() => setOpen(false)}>
      <ModalDialog sx={{ gap: 0 }}>
        <DialogTitle>Download your first LLM!</DialogTitle>
        <ModalClose variant="plain" sx={{ m: 1 }} />
        <hr />
        <Stack>
          <Typography level="body-sm">
            You need to install a model to build with Transformer Lab.
          </Typography>
          <Typography level="body-sm">
            An easy way to start is to download one of the following 
            recommended small models.
            You can also skip this and go to the <BoxesIcon size="12px" />{' '} Model Zoo
            where you can download your own model, or import from 
            elsewhere on your system.
          </Typography>
          <hr />
          <Typography level="body-lg" sx={{ fontSize: '20px' }} mb={2}>
            <b>Recommended Starting Models for {typeOfComputer(cpu, os, device)}:</b>
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
                  defaultChecked
                />
                {recommended_model.name} (recommended)
                <Typography level="body-sm" textColor="text.tertiary">
                    A great starting model for your machine's capabilities. ({recommended_model.size_of_model_in_mb})
                </Typography>
              </td>
            </tr>
            <tr>
              <td>
                <input
                  type="radio"
                  name="download_initial_model"
                  value="TinyLlama/TinyLlama-1.1B-Chat-v1.0"
                />
                Tiny Llama 1.1B Chat
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
                />
                Qwen2.5-1.5B-Instruct
                <Typography level="body-sm" textColor="text.tertiary">
                    A slightly larger model with better performance. (~3GB)
                </Typography>
              </td>
            </tr>
          </Table>
          <Button
            color="neutral"
            startDecorator={null}
            disabled={
                currentlyDownloading != null
              }
            onClick={async () => {
                const initial_model_id = document.getElementsByName('download_initial_model')[0].value;
                setCurrentlyDownloading(initial_model_id);

                // Try downloading the model
                const response = await chatAPI.downloadModelFromHuggingFace(initial_model_id);
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