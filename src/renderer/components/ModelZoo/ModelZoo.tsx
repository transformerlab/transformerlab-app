import Sheet from '@mui/joy/Sheet';
import { PackageIcon } from 'lucide-react';
import { useParams } from 'react-router-dom';
import AssetRegistryGrid from '../Registry/AssetRegistryGrid';
import ModelGroupDetail from './ModelGroupDetail';

export default function ModelZoo() {
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
        <ModelGroupDetail groupId={groupId} />
      ) : (
        <AssetRegistryGrid
          assetType="model"
          detailRoute={(id) => `/zoo/registry/${id}`}
          Icon={PackageIcon}
          emptyMessage="No model groups yet."
          emptyHint="Publish a model from a completed Job to create your first model."
        />
      )}
    </Sheet>
  );
}
