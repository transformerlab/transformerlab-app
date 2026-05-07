/* eslint-disable react/require-default-props */
import { FormControl, FormLabel, Input, Textarea, Typography } from '@mui/joy';

interface GcpProviderFieldsProps {
  gcpRegion: string;
  setGcpRegion: (value: string) => void;
  gcpZone: string;
  setGcpZone: (value: string) => void;
  gcpServiceAccountJson: string;
  setGcpServiceAccountJson: (value: string) => void;
  serviceAccountEmail?: string;
}

export default function GcpProviderFields({
  gcpRegion,
  setGcpRegion,
  gcpZone,
  setGcpZone,
  gcpServiceAccountJson,
  setGcpServiceAccountJson,
  serviceAccountEmail = undefined,
}: GcpProviderFieldsProps) {
  return (
    <>
      <FormControl sx={{ mt: 1 }}>
        <FormLabel>GCP Region *</FormLabel>
        <Input
          value={gcpRegion}
          onChange={(event) => setGcpRegion(event.currentTarget.value)}
          placeholder="us-central1"
        />
        <Typography level="body-sm" sx={{ mt: 0.5, color: 'text.tertiary' }}>
          Region used for launches when zone is not specified.
        </Typography>
      </FormControl>
      <FormControl sx={{ mt: 1 }}>
        <FormLabel>GCP Zone (optional)</FormLabel>
        <Input
          value={gcpZone}
          onChange={(event) => setGcpZone(event.currentTarget.value)}
          placeholder="us-central1-a"
        />
        <Typography level="body-sm" sx={{ mt: 0.5, color: 'text.tertiary' }}>
          Leave blank to use the region default zone (`&lt;region&gt;-a`).
        </Typography>
      </FormControl>
      <FormControl sx={{ mt: 1 }}>
        <FormLabel>
          Service Account JSON {serviceAccountEmail ? '(optional update)' : '*'}
        </FormLabel>
        <Textarea
          value={gcpServiceAccountJson}
          onChange={(event) =>
            setGcpServiceAccountJson(event.currentTarget.value)
          }
          minRows={5}
          maxRows={10}
          placeholder="Paste the contents of your GCP service account key JSON file"
        />
        <Typography level="body-sm" sx={{ mt: 0.5, color: 'text.tertiary' }}>
          {serviceAccountEmail
            ? `Current service account: ${serviceAccountEmail}. Paste a new JSON key only if you want to replace it.`
            : 'The key is stored on the API host and used to launch Compute Engine VMs.'}
        </Typography>
      </FormControl>
    </>
  );
}
