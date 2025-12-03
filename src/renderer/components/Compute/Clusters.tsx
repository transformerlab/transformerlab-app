import React, { useState, useEffect } from 'react';
import {
  Box,
  Button,
  Card,
  CardContent,
  Typography,
  List,
  ListItem,
  CircularProgress,
  IconButton,
} from '@mui/joy';
import { StopCircleIcon } from 'lucide-react';
import { authenticatedFetch } from 'renderer/lib/api-client/functions';
import { getPath } from 'renderer/lib/api-client/urls';

interface Cluster {
  cluster_name: string;
  state: string;
  resources_str?: string;
  provider_id: string;
}

export default function Clusters() {
  const [clusters, setClusters] = useState<Cluster[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchClusters();
  }, []);

  const fetchClusters = async () => {
    setLoading(true);
    try {
      const response = await authenticatedFetch(getPath('compute_provider', ['clusters'], {}));
      const data = await response.json();
      setClusters(data.clusters || []);
    } catch (error) {
      console.error('Failed to fetch clusters:', error);
    } finally {
      setLoading(false);
    }
  };

  const stopCluster = async (clusterName: string, providerId: string) => {
    try {
      await authenticatedFetch(getPath('compute_provider', [providerId, 'clusters', clusterName, 'stop'], {}), {
        method: 'POST',
      });
      // Refresh the list
      fetchClusters();
    } catch (error) {
      console.error('Failed to stop cluster:', error);
    }
  };

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" height="200px">
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box>
      <Typography level="h4" mb={2}>
        Running Clusters
      </Typography>
      <Card>
        <CardContent>
          {clusters.length === 0 ? (
            <Typography>No running clusters found.</Typography>
          ) : (
            <List>
              {clusters.map((cluster) => (
                <ListItem key={cluster.cluster_name}>
                  <Box flexGrow={1}>
                    <Typography>{cluster.cluster_name}</Typography>
                    <Typography level="body-sm">
                      Status: {cluster.state} | Resources: {cluster.resources_str || 'N/A'}
                    </Typography>
                  </Box>
                  <IconButton
                    color="danger"
                    onClick={() => stopCluster(cluster.cluster_name, cluster.provider_id)}
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