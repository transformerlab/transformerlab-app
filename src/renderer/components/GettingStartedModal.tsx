import {
  Button,
  DialogTitle,
  Modal,
  ModalClose,
  ModalDialog,
  Radio,
  Stack,
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
        <DialogTitle>Transformer Lab Setup</DialogTitle>
        <ModalClose variant="plain" sx={{ m: 1 }} />
        <hr />
        <Stack>
          <Typography>
            To get started building with TransformerLab you will need to
            download a foundation model. 
            You can either start by using one of the following recommended
            small models, or you can skip this and download your own model
            from the <BoxesIcon />{' '} Model Zoo.
          </Typography>
          <hr />
          <Typography level="body-lg" sx={{ fontSize: '20px' }} mb={2}>
            <b>Recommended Starting Models for {typeOfComputer(cpu, os, device)}:</b>
          </Typography>

          <tbody>
            <tr sx={{ gap: 0 }}>
              <td>
                <input
                  type="radio"
                  name="download_initial_model"
                  value="default"
                  checked={true}
                />
                {recommendedModel(cpu, os, device)}
                <Typography level="body-sm" textColor="text.tertiary">
                    A good model for your machine's architecture.
                </Typography>
              </td>
            </tr>
            <tr>
              <td>
                <input
                  type="radio"
                  name="download_initial_model"
                  value="tinyllama-1.1B"
                />
                Tiny Llama 1.1B
                <Typography level="body-sm" textColor="text.tertiary">
                    A popular small model based on Llama architecture.
                </Typography>
              </td>
            </tr>
          </tbody>
          <Button
            color="neutral"
            startDecorator={null}
          >
            Download selected model
          </Button>
          <Button
            variant="plain"
          >
            Skip for now
          </Button>
        </Stack>
      </ModalDialog>
    </Modal>
  );
}