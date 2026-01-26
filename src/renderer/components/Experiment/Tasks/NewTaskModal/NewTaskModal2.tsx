import * as React from 'react';
import Modal from '@mui/joy/Modal';
import DialogTitle from '@mui/joy/DialogTitle';
import DialogContent from '@mui/joy/DialogContent';
import DialogActions from '@mui/joy/DialogActions';
import Button from '@mui/joy/Button';
import {
  ModalClose,
  ModalDialog,
  Divider,
  Radio,
  RadioGroup,
  FormControl,
  FormLabel,
  Input,
  Box,
  Typography,
  Stack,
} from '@mui/joy';
import { PlayIcon } from 'lucide-react';

type NewTaskModal2Props = {
  open: boolean;
  onClose: () => void;
  title?: string;
};

export default function NewTaskModal2({
  open,
  onClose,
  title = 'Add New Task',
}: NewTaskModal2Props) {
  const [selectedOption, setSelectedOption] = React.useState<string>('git');
  const [gitUrl, setGitUrl] = React.useState<string>('');

  return (
    <Modal open={open} onClose={onClose}>
      <ModalDialog
        sx={{
          maxWidth: 700,
          width: '90%',
          maxHeight: '90vh',
          overflow: 'auto',
        }}
      >
        <ModalClose />
        <DialogTitle>{title}</DialogTitle>
        <Divider />
        <DialogContent>
          <Stack spacing={3} sx={{ mt: 2 }}>
            <FormControl sx={{ overflow: 'hidden' }}>
              <FormLabel>Choose how to add a new task:</FormLabel>
              <RadioGroup
                value={selectedOption}
                onChange={(e) => setSelectedOption(e.target.value)}
                sx={{ gap: 2, mt: 1 }}
              >
                <Stack spacing={1}>
                  <Radio value="git" label="Remote Git Repository" />
                  {selectedOption === 'git' && (
                    <Input
                      placeholder="https://github.com/username/repository.git"
                      value={gitUrl}
                      onChange={(e) => setGitUrl(e.target.value)}
                      sx={{ ml: 3 }}
                    />
                  )}
                </Stack>
                <Radio value="upload" label="Upload from your Computer" />
              </RadioGroup>
            </FormControl>

            {selectedOption === 'upload' && (
              <Box
                sx={{
                  border: '2px dashed',
                  borderColor: 'neutral.400',
                  borderRadius: 'md',
                  p: 4,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  minHeight: 150,
                }}
              >
                <Typography level="body-md" color="neutral">
                  Drag and Drop a Folder Here
                </Typography>
              </Box>
            )}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button startDecorator={<PlayIcon />} color="success">
            Submit
          </Button>
          <Button variant="plain" color="danger" onClick={onClose}>
            Cancel
          </Button>
        </DialogActions>
      </ModalDialog>
    </Modal>
  );
}
