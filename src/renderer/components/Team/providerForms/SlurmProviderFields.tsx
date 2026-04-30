import React from 'react';
import {
  Alert,
  FormControl,
  FormLabel,
  Input,
  Option,
  Select,
  Typography,
} from '@mui/joy';

interface SlurmProviderFieldsProps {
  slurmMode: 'ssh' | 'rest';
  setSlurmMode: (value: 'ssh' | 'rest') => void;
  slurmSshHost: string;
  setSlurmSshHost: (value: string) => void;
  slurmSshUser: string;
  setSlurmSshUser: (value: string) => void;
  slurmSshPort: string;
  setSlurmSshPort: (value: string) => void;
  slurmSshKeyPath: string;
  setSlurmSshKeyPath: (value: string) => void;
  slurmRestUrl: string;
  setSlurmRestUrl: (value: string) => void;
  slurmApiToken: string;
  setSlurmApiToken: (value: string) => void;
  providerId?: string;
  setSlurmApiTokenChanged: (changed: boolean) => void;
}

export default function SlurmProviderFields({
  slurmMode,
  setSlurmMode,
  slurmSshHost,
  setSlurmSshHost,
  slurmSshUser,
  setSlurmSshUser,
  slurmSshPort,
  setSlurmSshPort,
  slurmSshKeyPath,
  setSlurmSshKeyPath,
  slurmRestUrl,
  setSlurmRestUrl,
  slurmApiToken,
  setSlurmApiToken,
  providerId,
  setSlurmApiTokenChanged,
}: SlurmProviderFieldsProps) {
  return (
    <>
      <Alert color="primary" variant="soft" sx={{ mt: 2 }}>
        <Typography level="body-sm">
          <strong>SLURM User ID:</strong> All jobs launched through this
          provider will run as the specified SLURM user. Make sure your
          team&apos;s SSH key (from Team Settings → SSH Key) is added to that
          user&apos;s authorized_keys on the SLURM login node.
        </Typography>
      </Alert>

      <FormControl sx={{ mt: 2 }}>
        <FormLabel>Connection Mode</FormLabel>
        <Select
          value={slurmMode}
          onChange={(event, value) => setSlurmMode(value ?? 'ssh')}
          sx={{ width: '100%' }}
        >
          <Option value="ssh">SSH</Option>
          <Option value="rest">REST API</Option>
        </Select>
      </FormControl>

      {slurmMode === 'ssh' ? (
        <>
          <FormControl sx={{ mt: 1 }}>
            <FormLabel>SSH Host *</FormLabel>
            <Input
              value={slurmSshHost}
              onChange={(event) => setSlurmSshHost(event.currentTarget.value)}
              placeholder="slurm-login.example.com"
              fullWidth
            />
          </FormControl>
          <FormControl sx={{ mt: 1 }}>
            <FormLabel>SLURM User ID *</FormLabel>
            <Input
              value={slurmSshUser}
              onChange={(event) => setSlurmSshUser(event.currentTarget.value)}
              placeholder="your_slurm_username"
              fullWidth
            />
            <Typography
              level="body-sm"
              sx={{ mt: 0.5, color: 'text.tertiary' }}
            >
              All jobs will run as this user on SLURM
            </Typography>
          </FormControl>
          <FormControl sx={{ mt: 1 }}>
            <FormLabel>SSH Port</FormLabel>
            <Input
              value={slurmSshPort}
              onChange={(event) => setSlurmSshPort(event.currentTarget.value)}
              placeholder="22"
              type="number"
              fullWidth
            />
          </FormControl>
          <FormControl sx={{ mt: 1 }}>
            <FormLabel>SSH Key Path (Optional)</FormLabel>
            <Input
              value={slurmSshKeyPath}
              onChange={(event) =>
                setSlurmSshKeyPath(event.currentTarget.value)
              }
              placeholder="Leave empty to use team SSH key"
              fullWidth
            />
            <Typography
              level="body-sm"
              sx={{ mt: 0.5, color: 'text.tertiary' }}
            >
              Path to private key on API server. If empty, will use your
              team&apos;s SSH key.
            </Typography>
          </FormControl>
        </>
      ) : (
        <>
          <FormControl sx={{ mt: 1 }}>
            <FormLabel>REST API URL *</FormLabel>
            <Input
              value={slurmRestUrl}
              onChange={(event) => setSlurmRestUrl(event.currentTarget.value)}
              placeholder="https://slurm-api.example.com"
              fullWidth
            />
          </FormControl>
          <FormControl sx={{ mt: 1 }}>
            <FormLabel>SLURM User ID *</FormLabel>
            <Input
              value={slurmSshUser}
              onChange={(event) => setSlurmSshUser(event.currentTarget.value)}
              placeholder="your_slurm_username"
              fullWidth
            />
            <Typography
              level="body-sm"
              sx={{ mt: 0.5, color: 'text.tertiary' }}
            >
              All jobs will run as this user on SLURM
            </Typography>
          </FormControl>
          <FormControl sx={{ mt: 1 }}>
            <FormLabel>API Token (Optional)</FormLabel>
            <Input
              value={slurmApiToken}
              onChange={(event) => {
                setSlurmApiTokenChanged(true);
                setSlurmApiToken(event.currentTarget.value);
              }}
              placeholder={
                providerId
                  ? 'Leave blank to keep existing token'
                  : 'Your SLURM REST API token'
              }
              type="password"
              fullWidth
            />
          </FormControl>
        </>
      )}
    </>
  );
}
