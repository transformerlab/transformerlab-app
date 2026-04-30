import React from 'react';
import { FormControl, FormLabel, Input, Switch, Typography } from '@mui/joy';

interface SkypilotProviderFieldsProps {
  skypilotServerUrl: string;
  setSkypilotServerUrl: (value: string) => void;
  skypilotUserId: string;
  setSkypilotUserId: (value: string) => void;
  skypilotUserName: string;
  setSkypilotUserName: (value: string) => void;
  skypilotDockerImage: string;
  setSkypilotDockerImage: (value: string) => void;
  skypilotDefaultRegion: string;
  setSkypilotDefaultRegion: (value: string) => void;
  skypilotDefaultZone: string;
  setSkypilotDefaultZone: (value: string) => void;
  skypilotUseSpot: boolean;
  setSkypilotUseSpot: (value: boolean) => void;
}

export default function SkypilotProviderFields({
  skypilotServerUrl,
  setSkypilotServerUrl,
  skypilotUserId,
  setSkypilotUserId,
  skypilotUserName,
  setSkypilotUserName,
  skypilotDockerImage,
  setSkypilotDockerImage,
  skypilotDefaultRegion,
  setSkypilotDefaultRegion,
  skypilotDefaultZone,
  setSkypilotDefaultZone,
  skypilotUseSpot,
  setSkypilotUseSpot,
}: SkypilotProviderFieldsProps) {
  return (
    <>
      <FormControl sx={{ mt: 2 }}>
        <FormLabel>SkyPilot Server URL *</FormLabel>
        <Input
          value={skypilotServerUrl}
          onChange={(event) => setSkypilotServerUrl(event.currentTarget.value)}
          placeholder="http://localhost:46580"
          fullWidth
        />
      </FormControl>
      <FormControl sx={{ mt: 1 }}>
        <FormLabel>SkyPilot User ID</FormLabel>
        <Input
          value={skypilotUserId}
          onChange={(event) => setSkypilotUserId(event.currentTarget.value)}
          placeholder="Your SkyPilot user ID"
          fullWidth
        />
      </FormControl>
      <FormControl sx={{ mt: 1 }}>
        <FormLabel>SkyPilot User Name</FormLabel>
        <Input
          value={skypilotUserName}
          onChange={(event) => setSkypilotUserName(event.currentTarget.value)}
          placeholder="Your SkyPilot user name"
          fullWidth
        />
      </FormControl>
      <FormControl sx={{ mt: 1 }}>
        <FormLabel>Docker Image (optional)</FormLabel>
        <Input
          value={skypilotDockerImage}
          onChange={(event) =>
            setSkypilotDockerImage(event.currentTarget.value)
          }
          placeholder="docker:nvcr.io/nvidia/pytorch:23.10-py3"
          fullWidth
          sx={{ fontFamily: 'monospace', fontSize: 'sm' }}
        />
        <Typography level="body-sm" sx={{ mt: 0.5, color: 'text.tertiary' }}>
          Prefix with &quot;docker:&quot; to run inside a container on the
          provisioned VM. Must be Debian/Ubuntu-based. Leave empty to run
          directly on the VM.
        </Typography>
      </FormControl>
      <FormControl sx={{ mt: 1 }}>
        <FormLabel>Default Region (optional)</FormLabel>
        <Input
          value={skypilotDefaultRegion}
          onChange={(event) =>
            setSkypilotDefaultRegion(event.currentTarget.value)
          }
          placeholder="e.g. us-east-1"
          fullWidth
        />
      </FormControl>
      <FormControl sx={{ mt: 1 }}>
        <FormLabel>Default Zone (optional)</FormLabel>
        <Input
          value={skypilotDefaultZone}
          onChange={(event) =>
            setSkypilotDefaultZone(event.currentTarget.value)
          }
          placeholder="e.g. us-east-1a"
          fullWidth
        />
      </FormControl>
      <FormControl sx={{ mt: 1, flexDirection: 'row', alignItems: 'center' }}>
        <Switch
          checked={skypilotUseSpot}
          onChange={(event) => setSkypilotUseSpot(event.target.checked)}
          sx={{ mr: 1 }}
        />
        <FormLabel sx={{ m: 0 }}>Use Spot / Preemptible Instances</FormLabel>
      </FormControl>
    </>
  );
}
