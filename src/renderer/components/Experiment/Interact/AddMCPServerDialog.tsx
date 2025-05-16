import React, { useState } from 'react';
import {
  Modal,
  ModalDialog,
  Button,
  Input,
  FormLabel,
  FormControl,
  Stack,
  Radio,
  RadioGroup,
  Typography,
} from '@mui/joy';
import { Endpoints } from '../../../lib/api-client/endpoints';

export default function AddMCPServerDialog({ open, onClose, onInstalled }) {
  const [mode, setMode] = useState<'package' | 'file'>('package');
  const [packageName, setPackageName] = useState('');
  const [filePath, setFilePath] = useState('');
  const [args, setArgs] = useState('');
  const [env, setEnv] = useState('');
  const [loading, setLoading] = useState(false);

  const handleFilePick = async () => {
    // Then create and trigger the file picker
    const picker = document.createElement('input');
    picker.type = 'file';
    picker.onchange = (e: any) => {
      if (e.target.files.length > 0) {
        setFilePath(e.target.files[0].path || e.target.files[0].name);
        // Set mode after file is selected to ensure UI is updated properly
        setMode('file');
      }
    };
    picker.click();
  };

  const handleModeChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setMode(event.target.value as 'package' | 'file');
  };

  const handleInstall = async () => {
    setLoading(true);
    let serverName = mode === 'package' ? packageName : filePath;
    if (mode === 'package') {
      serverName = serverName.replace(/-/g, '_');
    }
    const resp = await fetch(Endpoints.Tools.InstallMcpPlugin(serverName));
    const result = await resp.json();
    setLoading(false);
    if (result.status === 'success') {
      // Store serverName, args, and env in config
      const configValue = JSON.stringify({ serverName, args, env });
      await fetch(Endpoints.Config.Set('MCP_SERVER', configValue), {
        method: 'GET',
      });
      onInstalled && onInstalled();
      onClose();
    } else {
      alert(result.message || 'Failed to install MCP server.');
    }
  };

  return (
    <Modal open={open} onClose={onClose}>
      <ModalDialog sx={{ minWidth: '450px' }}>
        <Stack spacing={2}>
          <FormLabel>Add MCP Server</FormLabel>
          <Typography
            level="body-sm"
            sx={{ mt: -1, mb: 1, color: 'text.secondary' }}
          >
            We support MCP Server Python packages installable via pip and custom
            MCP server implementations (.py) files that implement the
            ModelContextProtocol standard for stdio communication.
          </Typography>
          <RadioGroup
            name="mode-selector"
            value={mode}
            onChange={handleModeChange}
            row
          >
            <Radio value="package" label="Python Package" />
            <Radio value="file" label="File Path" />
          </RadioGroup>
          {mode === 'package' ? (
            <FormControl>
              <FormLabel>Python Package Name</FormLabel>
              <Input
                value={packageName}
                onChange={(e) => setPackageName(e.target.value)}
                placeholder="e.g. mcp-server-fetch"
              />
            </FormControl>
          ) : (
            <Stack direction="row" spacing={1}>
              <FormControl sx={{ flex: 1 }}>
                <FormLabel>File Path</FormLabel>
                <Input
                  value={filePath}
                  onChange={(e) => setFilePath(e.target.value)}
                  placeholder="/path/to/server.py"
                />
              </FormControl>
              <Button onClick={handleFilePick}>Pick File</Button>
            </Stack>
          )}
          <FormControl>
            <FormLabel>Args (comma separated)</FormLabel>
            <Input
              value={args}
              onChange={(e) => setArgs(e.target.value)}
              placeholder="arg1,arg2"
            />
          </FormControl>
          <FormControl>
            <FormLabel>Env (JSON)</FormLabel>
            <Input
              value={env}
              onChange={(e) => setEnv(e.target.value)}
              placeholder='{"KEY":"VALUE"}'
            />
          </FormControl>
          <Button loading={loading} onClick={handleInstall} disabled={loading}>
            Install MCP Server
          </Button>
        </Stack>
      </ModalDialog>
    </Modal>
  );
}
