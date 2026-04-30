/* eslint-disable react/require-default-props */
import { FormControl, FormLabel, Input, Textarea, Typography } from '@mui/joy';

interface GcpProviderFieldsProps {
  gcpProjectId: string;
  setGcpProjectId: (value: string) => void;
  gcpZone: string;
  setGcpZone: (value: string) => void;
  gcpServiceAccountJson: string;
  setGcpServiceAccountJson: (value: string) => void;
  serviceAccountEmail?: string;
}

export default function GcpProviderFields({
  gcpProjectId,
  setGcpProjectId,
  gcpZone,
  setGcpZone,
  gcpServiceAccountJson,
  setGcpServiceAccountJson,
  serviceAccountEmail = undefined,
}: GcpProviderFieldsProps) {
  return (
    <>
      <FormControl sx={{ mt: 1 }}>
        <FormLabel>GCP Project ID *</FormLabel>
        <Input
          value={gcpProjectId}
          onChange={(event) => setGcpProjectId(event.currentTarget.value)}
          placeholder="my-gcp-project"
        />
        <Typography level="body-sm" sx={{ mt: 0.5, color: 'text.tertiary' }}>
          Project where Compute Engine instances will be launched.
        </Typography>
      </FormControl>
      <FormControl sx={{ mt: 1 }}>
        <FormLabel>GCP Zone *</FormLabel>
        <Input
          value={gcpZone}
          onChange={(event) => setGcpZone(event.currentTarget.value)}
          placeholder="us-central1-a"
        />
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
