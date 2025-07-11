import React, { useState } from 'react';
import {
  Modal,
  ModalDialog,
  ModalClose,
  Button,
  Input,
  FormLabel,
  FormControl,
  Stack,
  Radio,
  RadioGroup,
} from '@mui/joy';
import { Endpoints } from '../../../lib/api-client/endpoints';
import * as chatAPI from '../../../lib/transformerlab-api-sdk';

export default function AddMCPServerDialog({ open, onClose, onInstalled }) {
  const [mode, setMode] = useState<'package' | 'file'>('package');
  const [packageName, setPackageName] = useState('');
  const [filePath, setFilePath] = useState('');
  const [args, setArgs] = useState('');
  const [env, setEnv] = useState('');
  const [loading, setLoading] = useState(false);

  const handleFilePick = async () => {
    // For Electron, use dialog API; for web, use input[type=file]
    const picker = document.createElement('input');
    picker.type = 'file';
    picker.onchange = (e: any) => {
      if (e.target.files.length > 0) {
        setFilePath(e.target.files[0].path || e.target.files[0].name);
      }
    };
    picker.click();
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
      await fetch(
        chatAPI.getAPIFullPath('config', ['set'], {
          key: 'MCP_SERVER',
          value: configValue,
        }),
      );
      // await fetch(Endpoints.Config.Set('MCP_SERVER', configValue), {
      //   method: 'GET',
      // });
      onInstalled && onInstalled();
      onClose();
    } else {
      alert(result.message || 'Failed to install MCP server.');
    }
  };

  return (
    <Modal open={open} onClose={onClose}>
      <ModalDialog>
        <ModalClose />
        <Stack spacing={2}>
          <FormLabel>Add MCP Server</FormLabel>
          <RadioGroup
            value={mode}
            onChange={(_, v) => setMode(v as 'package' | 'file')}
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
