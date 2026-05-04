/* eslint-disable react/require-default-props */
import React from 'react';
import {
  Box,
  FormControl,
  FormLabel,
  Input,
  Textarea,
  Typography,
} from '@mui/joy';

interface NebiusProviderFieldsProps {
  nebiusServiceAccountId: string;
  setNebiusServiceAccountId: (value: string) => void;
  nebiusPublicKeyId: string;
  setNebiusPublicKeyId: (value: string) => void;
  nebiusPrivateKey: string;
  setNebiusPrivateKey: (value: string) => void;
  nebiusParentId: string;
  setNebiusParentId: (value: string) => void;
  nebiusSubnetId: string;
  setNebiusSubnetId: (value: string) => void;
  nebiusRegion: string;
  setNebiusRegion: (value: string) => void;
  nebiusDefaultPlatform: string;
  setNebiusDefaultPlatform: (value: string) => void;
  nebiusDefaultPreset: string;
  setNebiusDefaultPreset: (value: string) => void;
  nebiusBootImageFamily: string;
  setNebiusBootImageFamily: (value: string) => void;
  nebiusDiskSizeGib: string;
  setNebiusDiskSizeGib: (value: string) => void;
  providerId?: string;
}

export default function NebiusProviderFields({
  nebiusServiceAccountId,
  setNebiusServiceAccountId,
  nebiusPublicKeyId,
  setNebiusPublicKeyId,
  nebiusPrivateKey,
  setNebiusPrivateKey,
  nebiusParentId,
  setNebiusParentId,
  nebiusSubnetId,
  setNebiusSubnetId,
  nebiusRegion,
  setNebiusRegion,
  nebiusDefaultPlatform,
  setNebiusDefaultPlatform,
  nebiusDefaultPreset,
  setNebiusDefaultPreset,
  nebiusBootImageFamily,
  setNebiusBootImageFamily,
  nebiusDiskSizeGib,
  setNebiusDiskSizeGib,
  providerId = undefined,
}: NebiusProviderFieldsProps) {
  return (
    <Box sx={{ mt: 1, display: 'flex', flexDirection: 'column', gap: 1.5 }}>
      <Typography level="body-sm" sx={{ color: 'text.tertiary' }}>
        Nebius CLI auth uses a <strong>service account key pair</strong> (not an
        uploaded public key file in this form): create a private key, upload the
        matching <strong>public</strong> <code>.pem</code> to the Nebius console
        for that service account, then copy the <strong>Public key ID</strong>{' '}
        the console shows. Paste the <strong>private key</strong> below—the
        public key stays only on Nebius. The <strong>Service account ID</strong>{' '}
        is your Nebius service account resource id. If your console only offers
        short &quot;access key&quot; style secrets, use the key-pair flow
        documented for the Nebius CLI <code>profile create</code> command
        instead.
      </Typography>
      <Typography level="body-sm" sx={{ color: 'text.tertiary' }}>
        Credentials are written to a provider-scoped CLI config on the API
        server so multiple Nebius providers in one org do not share profiles.
      </Typography>

      <FormControl>
        <FormLabel>Service Account ID{providerId ? '' : ' *'}</FormLabel>
        <Input
          value={nebiusServiceAccountId}
          onChange={(event) =>
            setNebiusServiceAccountId(event.currentTarget.value)
          }
          placeholder="serviceaccount-..."
          fullWidth
        />
      </FormControl>
      <FormControl>
        <FormLabel>Public Key ID{providerId ? '' : ' *'}</FormLabel>
        <Input
          value={nebiusPublicKeyId}
          onChange={(event) => setNebiusPublicKeyId(event.currentTarget.value)}
          placeholder="ID shown after you register the public key in Nebius"
          fullWidth
        />
      </FormControl>
      <FormControl>
        <FormLabel>Private Key{providerId ? '' : ' *'}</FormLabel>
        <Textarea
          value={nebiusPrivateKey}
          onChange={(event) => setNebiusPrivateKey(event.currentTarget.value)}
          placeholder="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----"
          minRows={5}
          maxRows={10}
        />
        {providerId ? (
          <Typography level="body-sm" sx={{ mt: 0.5, color: 'text.tertiary' }}>
            Leave credential fields blank to keep the existing Nebius
            credentials.
          </Typography>
        ) : null}
      </FormControl>

      <Typography level="title-sm" sx={{ mt: 1 }}>
        Infrastructure
      </Typography>
      <FormControl>
        <FormLabel>Project (parent) ID</FormLabel>
        <Input
          value={nebiusParentId}
          onChange={(event) => setNebiusParentId(event.currentTarget.value)}
          placeholder="Optional — Nebius project / parent resource id"
          fullWidth
        />
      </FormControl>
      <FormControl required>
        <FormLabel>Subnet ID *</FormLabel>
        <Input
          value={nebiusSubnetId}
          onChange={(event) => setNebiusSubnetId(event.currentTarget.value)}
          placeholder="VPC subnet for the VM network interface (required to launch)"
          fullWidth
        />
        <Typography level="body-sm" sx={{ mt: 0.5, color: 'text.tertiary' }}>
          Required for launches. The API rejects jobs without a configured
          subnet.
        </Typography>
      </FormControl>
      <FormControl>
        <FormLabel>Region</FormLabel>
        <Input
          value={nebiusRegion}
          onChange={(event) => setNebiusRegion(event.currentTarget.value)}
          placeholder="Optional"
          fullWidth
        />
      </FormControl>

      <Typography level="title-sm" sx={{ mt: 1 }}>
        Default VM shape (optional)
      </Typography>
      <Typography level="body-sm" sx={{ color: 'text.tertiary' }}>
        Nebius instances use a <strong>platform</strong> (hardware class, e.g.{' '}
        <code>gpu-h100-sxm</code>) and a <strong>preset</strong> (exact SKU like{' '}
        <code>1gpu-16vcpu-200gb</code>). Leave both blank to choose the shape
        per job from accelerators/CPU settings instead. If you set only one of
        platform/preset, leave the other blank unless you know they pair
        correctly.
      </Typography>
      <FormControl>
        <FormLabel>Default platform</FormLabel>
        <Input
          value={nebiusDefaultPlatform}
          onChange={(event) =>
            setNebiusDefaultPlatform(event.currentTarget.value)
          }
          placeholder="e.g. gpu-h100-sxm"
          fullWidth
        />
      </FormControl>
      <FormControl>
        <FormLabel>Default preset</FormLabel>
        <Input
          value={nebiusDefaultPreset}
          onChange={(event) =>
            setNebiusDefaultPreset(event.currentTarget.value)
          }
          placeholder="e.g. 1gpu-16vcpu-200gb"
          fullWidth
        />
      </FormControl>
      <FormControl>
        <FormLabel>Boot image family</FormLabel>
        <Input
          value={nebiusBootImageFamily}
          onChange={(event) =>
            setNebiusBootImageFamily(event.currentTarget.value)
          }
          placeholder="Leave blank for automatic (GPU vs CPU)"
          fullWidth
        />
      </FormControl>
      <FormControl>
        <FormLabel>Boot disk size (GiB)</FormLabel>
        <Input
          value={nebiusDiskSizeGib}
          onChange={(event) => setNebiusDiskSizeGib(event.currentTarget.value)}
          placeholder="Default 200 if unset"
          fullWidth
        />
      </FormControl>
    </Box>
  );
}
