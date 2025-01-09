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

function recommendedModel(cpu : string, os : string, device : string) {
    if (!cpu || !os || !device) return '';
  
    if (cpu == 'arm64' && os == 'Darwin') {
      return 'Llama-3.2-1B-Instruct-4bit (MLX)';
    }
  
    if (device == 'cuda') {
      return 'Tiny Llama';
    }
  
    return 'GGUF models';
    // return `${cpu}, ${os}, ${device}`;
  }
  
  function typeOfComputer(cpu : string, os : string, device : string) {
    if (!cpu || !os || !device) return '';
  
    if (cpu == 'arm64' && os == 'Darwin') {
      return 'Apple Silicon Mac';
    }
  
    return `${cpu} based ${os} computer with ${device} support`;
  }

export default function GettingStartedModal({ open, setOpen, server }) {

  const cpu = server?.cpu;
  const os = server?.os;
  const device = server?.device;

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
                  value="default"
                />
                {recommendedModel(cpu, os, device)} (recommended)
                <Typography level="body-sm" textColor="text.tertiary">
                    A great starting model for your machine's capabilities. (~1GB)
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
                    A popular small model based on Llama architecture. (~2GB)
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
          >
            Download selected model
          </Button>
          <Button
            variant="plain"
            onClick={() => setOpen(false)}
          >
            Skip for now
          </Button>
        </Stack>
      </ModalDialog>
    </Modal>
  );
}