import {
  DialogTitle,
  Modal,
  ModalClose,
  ModalDialog,
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
        <Stack direction="row" alignItems="flex-start">
          <DialogTitle>Transformer Lab Setup</DialogTitle>
          <ModalClose variant="plain" sx={{ m: 1 }} />
          <div>
            <Typography level="body-lg" sx={{ fontSize: '24px' }} mb={2}>
              Get started by downloading a small model from the <BoxesIcon />{' '}
              Model Zoo. <b>{recommendedModel(cpu, os, device)}</b> could be a
              great starting point for your {typeOfComputer(cpu, os, device)}.
            </Typography>
          </div>
        </Stack>
      </ModalDialog>
    </Modal>
  );
}