import React, { useEffect, useState } from 'react';
import {
  DialogTitle,
  Modal,
  ModalDialog,
  Sheet,
  Input,
  Typography,
  Button,
  List,
  ListItem,
  ListItemDecorator,
  Chip,
  IconButton,
} from '@mui/joy';
import { DownloadIcon, TrashIcon, X } from 'lucide-react';
import * as chatAPI from 'renderer/lib/transformerlab-api-sdk';
import { getFullPath } from 'renderer/lib/transformerlab-api-sdk';
import DownloadProgressBox from '../../Shared/DownloadProgressBox';

export default function ControlNetModal({
  open,
  onClose,
  selectedControlnet,
  onSelect,
}) {
  const [controlNets, setControlNets] = useState<string[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [jobId, setJobId] = useState<number | null>(null);
  const [currentlyInstalling, setCurrentlyInstalling] = useState<string | null>(
    null,
  );

  const refresh = async () => {
    try {
      const response = await fetch(
        getFullPath('diffusion', ['listControlnets'], {}),
      );
      const models = await response.json();
      const names = (models.controlnets || []).map(
        (m) => m.model_id || m.name || m.id || '',
      );

      setControlNets(names);
    } catch (e) {
      console.error('❌ Failed to fetch controlnets:', e);
    }
  };

  useEffect(() => {
    if (open) refresh();
  }, [open]);

  const pollJobStatus = (jobId) => {
    const intervalId = setInterval(async () => {
      try {
        const response = await fetch(chatAPI.Endpoints.Jobs.Get(jobId));
        const result = await response.json();

        if (
          result.status === 'SUCCESS' ||
          result.status === 'FAILED' ||
          result.status === 'UNAUTHORIZED' ||
          result.status === 'COMPLETE'
        ) {
          clearInterval(intervalId);

          if (result.status === 'SUCCESS' || result.status === 'COMPLETE') {
            alert('✅ ControlNet installed successfully!');
          } else {
            alert('❌ ControlNet install failed with unknown error.');
          }

          setCurrentlyInstalling(null);
          setJobId(null);
          refresh(); // reload controlNets
        }
      } catch (error) {
        console.error('Error polling job status:', error);
        clearInterval(intervalId);
        setCurrentlyInstalling(null);
        setJobId(null);
        alert('An error occurred while checking ControlNet install status.');
      }
    }, 3000);
  };

  const handleInstall = async () => {
    const controlnetId = inputValue.trim();
    if (!controlnetId) {
      alert('Please enter a ControlNet ID.');
      return;
    }

    const secureId = controlnetId.replace(/\//g, '_');

    // Check existing
    try {
      const existingResponse = await fetch(
        getFullPath('diffusion', ['listControlnets'], {}),
      );
      const existing = await existingResponse.json();
      const alreadyInstalled = (existing?.controlnets || []).map(
        (m) => m.name?.replace(/\//g, '_') || m.id?.replace(/\//g, '_'),
      );

      if (alreadyInstalled.includes(secureId)) {
        const confirmReplace = confirm(
          'This ControlNet is already installed. Do you want to reinstall it?',
        );
        if (!confirmReplace) return;

        await fetch(
          getFullPath('diffusion', ['deleteControlnet'], {
            controlnet: controlnetId,
          }),
        );
      }
    } catch (e) {
      console.warn('⚠️ Failed to check or delete existing ControlNet:', e);
    }

    setCurrentlyInstalling(controlnetId);

    try {
      const res = await fetch(
        getFullPath('diffusion', ['installControlnet'], {
          controlnet_id: controlnetId,
        }),
        { method: 'POST' },
      );
      const result = await res.json();

      if (result.status === 'started') {
        setJobId(result.job_id);
        pollJobStatus(result.job_id);
      } else {
        alert(
          `❌ Failed to start ControlNet install: ${result.message || 'Unknown error'}`,
        );
        setCurrentlyInstalling(null);
      }
    } catch (error) {
      console.error('Error installing controlnet:', error);
      alert('❌ Install failed due to a server or network error.');
      setCurrentlyInstalling(null);
    }
  };

  const handleDelete = async (id: string) => {
    await fetch(chatAPI.Endpoints.Models.Delete(id, true));
    if (selectedControlnet === id) onSelect('off');
    refresh();
  };

  const handleSelect = (id: string) => {
    onSelect(id === selectedControlnet ? 'off' : id);
  };

  return (
    <Modal open={open} onClose={onClose}>
      <ModalDialog sx={{ width: 600, maxHeight: '90vh', overflowY: 'auto' }}>
        <DialogTitle
          sx={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          Manage ControlNets
          <IconButton onClick={onClose}>
            <X size={18} />
          </IconButton>
        </DialogTitle>
        <Sheet sx={{ p: 2, borderRadius: 'md' }}>
          <Typography level="body-sm">
            Enter a Hugging Face model ID to install:
          </Typography>
          <Input
            size="sm"
            placeholder="e.g. thibaud/controlnet-openpose-sdxl-1.0"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            endDecorator={
              <Button size="sm" onClick={handleInstall} disabled={!inputValue}>
                Download
              </Button>
            }
            sx={{ mt: 1 }}
          />
        </Sheet>

        {currentlyInstalling && jobId && (
          <Sheet sx={{ borderRadius: 'md', p: 2, my: 2 }}>
            <DownloadProgressBox
              jobId={jobId}
              assetName={currentlyInstalling}
            />
          </Sheet>
        )}

        <List
          size="sm"
          sx={{
            mt: 2,
            maxHeight: 300,
            overflowY: 'auto',
            border: '1px solid #ddd',
            borderRadius: '8px',
          }}
        >
          {controlNets.map((id) => (
            <ListItem
              key={id}
              variant={selectedControlnet === id ? 'soft' : 'plain'}
              endAction={
                <>
                  <Button
                    size="sm"
                    variant={selectedControlnet === id ? 'solid' : 'soft'}
                    onClick={() => handleSelect(id)}
                    sx={{ mr: 1 }}
                  >
                    {selectedControlnet === id ? 'Selected' : 'Select'}
                  </Button>
                  <Button
                    size="sm"
                    variant="outlined"
                    color="danger"
                    onClick={() => handleDelete(id)}
                  >
                    <TrashIcon size={16} />
                  </Button>
                </>
              }
            >
              <ListItemDecorator>
                <DownloadIcon size={16} />
              </ListItemDecorator>
              {id}
              {selectedControlnet === id && (
                <Chip size="sm" variant="soft" color="success" sx={{ ml: 1 }}>
                  Active
                </Chip>
              )}
            </ListItem>
          ))}
        </List>
      </ModalDialog>
    </Modal>
  );
}
