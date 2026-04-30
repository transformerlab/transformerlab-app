import React from 'react';
import { FormControl, FormLabel, Input, Typography } from '@mui/joy';

interface AzureProviderFieldsProps {
  azureSubscriptionId: string;
  setAzureSubscriptionId: (value: string) => void;
  azureTenantId: string;
  setAzureTenantId: (value: string) => void;
  azureClientId: string;
  setAzureClientId: (value: string) => void;
  azureClientSecret: string;
  setAzureClientSecret: (value: string) => void;
  azureLocation: string;
  setAzureLocation: (value: string) => void;
  providerId?: string;
  setAzureClientSecretChanged: (changed: boolean) => void;
}

export default function AzureProviderFields({
  azureSubscriptionId,
  setAzureSubscriptionId,
  azureTenantId,
  setAzureTenantId,
  azureClientId,
  setAzureClientId,
  azureClientSecret,
  setAzureClientSecret,
  azureLocation,
  setAzureLocation,
  providerId,
  setAzureClientSecretChanged,
}: AzureProviderFieldsProps) {
  return (
    <>
      <FormControl sx={{ mt: 2 }}>
        <FormLabel>Subscription ID *</FormLabel>
        <Input
          value={azureSubscriptionId}
          onChange={(event) => setAzureSubscriptionId(event.currentTarget.value)}
          placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
          fullWidth
        />
      </FormControl>
      <FormControl sx={{ mt: 1 }}>
        <FormLabel>Tenant ID *</FormLabel>
        <Input
          value={azureTenantId}
          onChange={(event) => setAzureTenantId(event.currentTarget.value)}
          placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
          fullWidth
        />
      </FormControl>
      <FormControl sx={{ mt: 1 }}>
        <FormLabel>Client ID *</FormLabel>
        <Input
          value={azureClientId}
          onChange={(event) => setAzureClientId(event.currentTarget.value)}
          placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
          fullWidth
        />
      </FormControl>
      <FormControl sx={{ mt: 1 }}>
        <FormLabel>Client Secret *</FormLabel>
        <Input
          value={azureClientSecret}
          onChange={(event) => {
            setAzureClientSecretChanged(true);
            setAzureClientSecret(event.currentTarget.value);
          }}
          placeholder={
            providerId
              ? 'Leave blank to keep existing secret'
              : 'Your Service Principal client secret'
          }
          type="password"
          fullWidth
        />
      </FormControl>
      <FormControl sx={{ mt: 1 }}>
        <FormLabel>Location *</FormLabel>
        <Input
          value={azureLocation}
          onChange={(event) => setAzureLocation(event.currentTarget.value)}
          placeholder="eastus"
          fullWidth
        />
        <Typography level="body-sm" sx={{ mt: 0.5, color: 'text.tertiary' }}>
          Azure region where VMs will be launched (e.g. eastus, westus2,
          eastus2).
        </Typography>
      </FormControl>
    </>
  );
}
