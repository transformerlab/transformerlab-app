import React, { useState, useEffect } from 'react';
import {
  Box,
  Button,
  Input,
  Modal,
  ModalDialog,
  Select,
  Typography,
  Option,
} from '@mui/joy';
import { useAPI, useAuth } from 'renderer/lib/authContext';
import { getPath } from 'renderer/lib/api-client/urls';

interface ProviderDetailsModalProps {
  open: boolean;
  onClose: () => void;
  teamId: string;
  providerId?: string;
}

export default function ProviderDetailsModal({
  open,
  onClose,
  teamId,
  providerId,
}: ProviderDetailsModalProps) {
  const [name, setName] = useState('');
  const [type, setType] = useState('');
  const [config, setConfig] = useState('');
  const [loading, setLoading] = useState(false);
  const { fetchWithAuth } = useAuth();
  const { data: providerData } = useAPI('providers', ['get'], {
    providerId,
  });

  // if a providerId is passed then we are editing an existing provider
  // Otherwise we are creating a new provider
  useEffect(() => {
    if (providerId && providerData) {
      setName(providerData.name);
      setType(providerData.type);
      setConfig(providerData.config);
    } else {
      setName('');
      setType('');
      setConfig('');
    }
  }, [providerId]);

  async function createProvider(name: String, type: String, config: String) {
    return await fetchWithAuth(
        getPath('providers', ['create'], { teamId }),
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ name, type, config }),
        },
      );
  };

  async function updateProvider(id: String, name: String, config: String) {
    return await fetchWithAuth(
        getPath('providers', ['update'], { providerId: id, teamId }),
        {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ name, config }),
        },
      );

  };

  const saveProvider = async () => {
    setLoading(true);
    try {
      // The API expects an object for config, not a JSON string
      const parsedConfig =
        typeof config === 'string' ? JSON.parse(config) : config;

      const response = providerId ?
        await updateProvider(providerId, name, parsedConfig) :
        await createProvider(name, type, parsedConfig);

      if (response.ok) {
        setName('');
        setConfig('');
        onClose();
      } else {
        const errorData = await response.json();
        console.error('Error updating provider:', errorData);
      }
    } catch (error) {
      console.error('Error updating provider:', error);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose}>
      <ModalDialog sx={{ gap: 0 }}>
        <Typography level="h4" component="div" sx={{ mb: 2 }}>
          Add Provider
        </Typography>
        <Typography level="body-sm" sx={{ mb: 0.5 }}>
          Provider Name:
        </Typography>
        <Input
          value={name}
          onChange={(event) => setName(event.currentTarget.value)}
          placeholder="Enter friendly name for provider"
          fullWidth
        />
        <Typography level="body-sm" sx={{ mb: 0.5, mt: 3 }}>
          Provider Type:
        </Typography>
        <Select
          value={type}
          onChange={(event, value) => setType(value ?? 'skypilot')}
          sx={{ width: '100%' }}
        >
          <Option value="skypilot">Skypilot</Option>
          <Option value="slurm">Slurm</Option>
        </Select>
        <Typography level="body-sm" sx={{ mb: 0.5, mt: 3 }}>
          Configuration:
        </Typography>
        <Input
          value={typeof config === 'string' ? config : JSON.stringify(config)}
          onChange={(event) => setConfig(event.currentTarget.value)}
          placeholder="JSON sent to provider"
          fullWidth
        />
        <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 2 }}>
          <Button variant="outlined" onClick={onClose} sx={{ mr: 1 }}>
            Cancel
          </Button>
          <Button onClick={saveProvider} loading={loading}>
            {providerId ? 'Save Provider' : 'Add Provider'}
          </Button>
        </Box>
      </ModalDialog>
    </Modal>
  );
}
