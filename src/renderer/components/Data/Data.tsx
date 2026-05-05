import Sheet from '@mui/joy/Sheet';
import { DatabaseIcon } from 'lucide-react';
import { useParams } from 'react-router-dom';
import AssetRegistryGrid from '../Registry/AssetRegistryGrid';
import DatasetGroupDetail from './DatasetGroupDetail';

export default function Data() {
  const { groupId } = useParams<{ groupId?: string }>();

  return (
    <Sheet
      sx={{
        display: 'flex',
        height: '100%',
        flexDirection: 'column',
        overflow: 'hidden',
        p: 2,
      }}
    >
      {groupId ? (
        <DatasetGroupDetail groupId={groupId} />
      ) : (
        <AssetRegistryGrid
          assetType="dataset"
          detailRoute={(id) => `/data/registry/${id}`}
          Icon={DatabaseIcon}
          emptyMessage="No dataset groups yet."
          emptyHint="Publish a dataset from a completed Job to create your first dataset."
        />
      )}
    </Sheet>
  );
}
