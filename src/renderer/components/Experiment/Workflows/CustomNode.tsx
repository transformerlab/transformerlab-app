import { Typography } from '@mui/joy';
import { BuiltInNode, Handle } from '@xyflow/react';
import { NodeProps, Position } from '@xyflow/system';
import { XIcon } from 'lucide-react';

function chipColorByType(jobType: string) {
  switch (jobType) {
    case 'EVAL':
      return 'var(--joy-palette-success-200)';
    case 'TRAIN':
      return 'var(--joy-palette-warning-200)';
    default:
      return 'var(--joy-palette-danger-200)';
  }
}

export default function memo({
  data,
  isConnectable,
  targetPosition = Position.Top,
  sourcePosition = Position.Bottom,
}: NodeProps<BuiltInNode>) {
  return (
    <div className="custom-node" style={{ width: '100%' }}>
      <div
        className="type-badge"
        style={{
          backgroundColor: chipColorByType(data?.jobType),
          width: '100%',
          borderRadius: '3px',
        }}
      >
        <Typography level="body-xs">{data?.jobType}</Typography>
      </div>
      <div
        className="custom-node-delete-button"
        style={{
          position: 'absolute',
          cursor: 'pointer',
          borderRadius: '50%',
        }}
        onClick={() => {
          alert('delete node: ' + data?.id);
        }}
      >
        <XIcon size="12px" />
      </div>
      <Handle
        type="target"
        position={targetPosition}
        isConnectable={isConnectable}
      />
      <div
        className="custom-node-content"
        style={{ overflow: 'hidden', padding: '5px' }}
      >
        <Typography level="title-md">{data?.label}</Typography>
        <Typography level="body-sm">{data?.template}</Typography>
        {/* {JSON.stringify(data, null, 2)} */}
      </div>
      <Handle
        type="source"
        position={sourcePosition}
        isConnectable={isConnectable}
      />
    </div>
  );
}
