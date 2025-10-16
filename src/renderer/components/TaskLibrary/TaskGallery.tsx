import * as React from 'react';
import Modal from '@mui/joy/Modal';
import { ModalClose, ModalDialog } from '@mui/joy';
import DialogTitle from '@mui/joy/DialogTitle';
import DialogContent from '@mui/joy/DialogContent';
import DialogActions from '@mui/joy/DialogActions';
import Button from '@mui/joy/Button';
import List from '@mui/joy/List';
import ListItem from '@mui/joy/ListItem';
import ListItemDecorator from '@mui/joy/ListItemDecorator';
import ListItemContent from '@mui/joy/ListItemContent';
import Typography from '@mui/joy/Typography';
import Box from '@mui/joy/Box';
import IconButton from '@mui/joy/IconButton';
import { Plus } from 'lucide-react';
import { TestTubeDiagonalIcon } from 'lucide-react';

type ExampleTask = {
  id: string;
  title: string;
  description: string;
  yaml?: string;
};

type Props = {
  open: boolean;
  onClose: () => void;
  onSelect?: (task: ExampleTask) => void;
};

export default function TaskGallery({ open, onClose, onSelect }: Props) {
  const examples: ExampleTask[] = [
    {
      id: 'finetune-llama-3',
      title: 'Fine-tune LLaMA 3 (Domain Adaptation)',
      description:
        'Example pipeline and config to adapt LLaMA 3 to specialized domain data with low-rate learning & validation.',
      yaml: '# example: finetune-llama-3\nmodel: llama-3\ntrain: ...',
    },
    {
      id: 'nanochat',
      title: 'NanoChat Quickstart',
      description:
        'Small-footprint conversational agent example optimized for edge/low-latency inference.',
      yaml: '# example: nanochat\nmodel: nanochat\nparams: ...',
    },
    {
      id: 'unsloth-finetune',
      title: 'Fine-tune with UnSloth (Efficient)',
      description:
        'Configuration demonstrating UnSloth optimizations and resource-aware schedules for fast iterations.',
      yaml: '# example: unsloth\nframework: unsloth\n...',
    },
    {
      id: 'gpt-oss-train',
      title: 'Train GPT-OSS-compatible Model',
      description:
        'Minimal training recipe for an open GPT-style model useful for experimentation and reproducibility.',
      yaml: '# example: gpt-oss\ntrain:\n  epochs: 3\n',
    },
    {
      id: 'yolo-train',
      title: 'YOLO Object Detection Demo',
      description:
        'Dataset, augmentation and training config to train a YOLO-based object detector for real-time use.',
      yaml: '# example: yolo\nmodel: yolov5\n',
    },
  ];

  const handleSelect = (task: ExampleTask) => {
    if (onSelect) onSelect(task);
    onClose();
  };

  const handleImportClick = (e: React.MouseEvent, task: ExampleTask) => {
    e.stopPropagation();
    handleSelect(task);
  };

  return (
    <Modal open={open} onClose={onClose}>
      <ModalDialog
        sx={{ maxHeight: '90vh', width: '60vw', overflow: 'hidden' }}
      >
        <ModalClose />
        <DialogTitle>Example Tasks Gallery</DialogTitle>

        <DialogContent sx={{ maxHeight: '70vh', overflow: 'auto', p: 0 }}>
          <List sx={{ p: 1, gap: 1 }}>
            {examples.map((ex) => (
              <ListItem
                key={ex.id}
                variant="outlined"
                sx={{
                  cursor: 'pointer',
                  '&:hover': { bgcolor: 'action.hover' },
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 1,
                  p: 2,
                }}
                onClick={() => handleSelect(ex)}
              >
                <ListItemDecorator sx={{ mt: '4px' }}>
                  <span role="img" aria-label="task">
                    <TestTubeDiagonalIcon />
                  </span>
                </ListItemDecorator>

                <ListItemContent sx={{ minWidth: 0 }}>
                  <Typography fontWeight="lg">{ex.title}</Typography>
                  <Typography level="body2" textColor="text.tertiary">
                    {ex.description}
                  </Typography>
                </ListItemContent>

                <Box sx={{ ml: 'auto', display: 'flex', alignItems: 'start' }}>
                  <Button
                    size="sm"
                    variant="outlined"
                    onClick={(e) => handleImportClick(e, ex)}
                    startDecorator={<Plus size={12} />}
                  >
                    Import
                  </Button>
                </Box>
              </ListItem>
            ))}
          </List>
        </DialogContent>

        {/* <DialogActions>
          <Button variant="plain" color="neutral" onClick={onClose}>
            Close
          </Button>
        </DialogActions> */}
      </ModalDialog>
    </Modal>
  );
}
