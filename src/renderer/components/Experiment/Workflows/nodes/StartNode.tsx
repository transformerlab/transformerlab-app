import { Typography } from '@mui/joy';
import { BuiltInNode, Handle, useReactFlow } from '@xyflow/react';
import { NodeProps, Position } from '@xyflow/system';
import { XIcon } from 'lucide-react';

export default function memo({
  id,
  data,
  isConnectable,
  targetPosition = Position.Top,
  sourcePosition = Position.Bottom,
}: NodeProps<BuiltInNode>) {
  const { deleteElements } = useReactFlow();

  const handleDelete = () => {
    deleteElements({ nodes: [{ id }] });
  };

  return (
    <div className="custom-node" style={{ width: '100%' }}>
      <div
        className="type-badge"
        style={{
          // backgroundColor: 'var(--joy-palette-success-400)',
          width: '100%',
          borderRadius: '3px',
        }}
      >
        <Typography
          level="body-xs"
          sx={{ color: 'var(--joy-palette-primary-plainColor)' }}
        >
          START
        </Typography>
      </div>
      <Handle
        type="source"
        position={sourcePosition}
        isConnectable={isConnectable}
      />
    </div>
  );
}
