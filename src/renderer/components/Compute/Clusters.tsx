import React, { useState, useEffect } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  List,
  ListItem,
  CircularProgress,
  IconButton,
  Select,
  Option,
  FormControl,
  FormLabel,
} from '@mui/joy';
import { StopCircleIcon } from 'lucide-react';
import {
  authenticatedFetch,
  getAPIFullPath,
} from 'renderer/lib/transformerlab-api-sdk';

interface Cluster {
  cluster_name: string;
  state: string;
  resources_str?: string;
  provider_id: string;
}

interface Provider {
  id: string;
  name: string;
  type: string;
}

export default function Clusters() {
  const [clusters, setClusters] = useState<Cluster[]>([]);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [selectedProvider, setSelectedProvider] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [stoppingClusters, setStoppingClusters] = useState<Set<string>>(
    new Set(),
  );

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async (fetchProviders = true) => {
    setLoading(true);
    try {
      const promises = [
        authenticatedFetch(
          getAPIFullPath('compute_provider', ['clusters'], {}),
        ),
      ];

      if (fetchProviders) {
        promises.unshift(
          authenticatedFetch(getAPIFullPath('compute_provider', ['list'], {})),
        );
      }

      const responses = await Promise.all(promises);

      let providersData = providers; // Keep existing providers if not fetching
      let clustersData = { clusters: [] };

      if (fetchProviders) {
        const [providersRes, clustersRes] = responses;
        if (providersRes.ok) {
          providersData = await providersRes.json();
        } else {
          console.error(
            'Failed to fetch providers:',
            await providersRes.text(),
          );
        }
        if (clustersRes.ok) {
          clustersData = await clustersRes.json();
        } else {
          console.error('Failed to fetch clusters:', await clustersRes.text());
        }
      } else {
        const [clustersRes] = responses;
        if (clustersRes.ok) {
          clustersData = await clustersRes.json();
        } else {
          console.error('Failed to fetch clusters:', await clustersRes.text());
        }
      }

      setProviders(Array.isArray(providersData) ? providersData : []);
      setClusters(clustersData.clusters || []);

      if (fetchProviders && providersData.length > 0 && !selectedProvider) {
        setSelectedProvider(providersData[0].id);
      }
    } catch (error) {
      console.error('Failed to fetch data:', error);
    } finally {
      setLoading(false);
    }
  };

  const stopCluster = async (clusterName: string, providerId: string) => {
    // Add to stopping set
    setStoppingClusters((prev) => new Set(prev).add(clusterName));

    try {
      const url = getAPIFullPath('compute_provider', ['stopCluster'], {
        providerId,
        clusterName,
      });
      if (!url) {
        console.error('API URL is null - check window.TransformerLab.API_URL');
        return;
      }
      const response = await authenticatedFetch(url, {
        method: 'POST',
      });

      if (response.ok) {
        const result = await response.json();

        // Show success/error message based on status
        if (result.status === 'error') {
          console.error('Failed to stop cluster:', result.message);
        }
      } else {
        console.error('Failed to stop cluster - HTTP error:', response.status);
      }

      // Refresh only clusters (not providers) after stopping
      await fetchData(false);
    } catch (error) {
      console.error('Failed to stop cluster:', error);
    } finally {
      // Remove from stopping set
      setStoppingClusters((prev) => {
        const newSet = new Set(prev);
        newSet.delete(clusterName);
        return newSet;
      });
    }
  };

  const filteredClusters = selectedProvider
    ? clusters.filter((cluster) => cluster.provider_id === selectedProvider)
    : clusters;

  if (loading) {
    return (
      <Box
        display="flex"
        justifyContent="center"
        alignItems="center"
        height="200px"
      >
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box>
      <Typography level="h4" mb={2}>
        Running Clusters
      </Typography>
      <FormControl sx={{ mb: 2, maxWidth: 400 }}>
        <FormLabel>Select Provider</FormLabel>
        <Select
          value={selectedProvider}
          onChange={(event, newValue) => setSelectedProvider(newValue || '')}
        >
          {providers.map((provider) => (
            <Option key={provider.id} value={provider.id}>
              {provider.name} ({provider.type})
            </Option>
          ))}
        </Select>
      </FormControl>
      <Card>
        <CardContent>
          {filteredClusters.length === 0 ? (
            <Typography>
              No running clusters found for the selected provider.
            </Typography>
          ) : (
            <List>
              {filteredClusters.map((cluster) => (
                <ListItem key={cluster.cluster_name}>
                  <Box flexGrow={1}>
                    <Typography>{cluster.cluster_name}</Typography>
                    <Typography level="body-sm">
                      Status: {cluster.state} | Resources:{' '}
                      {cluster.resources_str || 'N/A'}
                    </Typography>
                  </Box>
                  <IconButton
                    color="danger"
                    disabled={stoppingClusters.has(cluster.cluster_name)}
                    onClick={() =>
                      stopCluster(cluster.cluster_name, cluster.provider_id)
                    }
                    loading={stoppingClusters.has(cluster.cluster_name)}
                  >
                    <StopCircleIcon />
                  </IconButton>
                </ListItem>
              ))}
            </List>
          )}
        </CardContent>
      </Card>
    </Box>
  );
}
