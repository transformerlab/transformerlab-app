import { Select, Typography, Option, Chip } from '@mui/joy';
import { BuiltInNode, Handle, useReactFlow } from '@xyflow/react';
import { NodeProps, Position } from '@xyflow/system';
import { XIcon } from 'lucide-react';

import { colorArray, mixColorWithBackground } from 'renderer/lib/utils';

function chipColorByType(jobType: string) {
  switch (jobType) {
    case 'EVAL':
      return mixColorWithBackground(colorArray[0]);
    case 'TRAIN':
      return mixColorWithBackground(colorArray[1]);
    case 'GENERATE':
      return mixColorWithBackground(colorArray[2]);
    default:
      return mixColorWithBackground(colorArray[3]);
  }
}

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
          backgroundColor: chipColorByType(data?.jobType),
          width: '100%',
          borderTopLeftRadius: '6px',
          borderTopRightRadius: '6px',
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
        role="button"
        tabIndex={0}
        aria-label="Delete node"
        onClick={() => {
          handleDelete();
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            handleDelete();
          }
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
        style={{
          overflow: 'hidden',
          padding: '5px',
          width: '100%',
          display: 'flex',
          flexDirection: 'column',
          gap: '5px',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: 'var(--joy-palette-background-level1)',
          borderBottomLeftRadius: '6px',
          borderBottomRightRadius: '6px',
        }}
      >
        <Typography level="title-md">{data?.label}</Typography>
        <Chip variant="outlined">{data?.task}</Chip>
        {/* <Typography level="body-sm">{data?.task}</Typography> */}
        {/* <Select
          id={`task-select-${id}`}
          value={data?.task}
          size="sm"
          variant="plain"
          sx={{ minHeight: 'unset' }}
        >
          <Option value={data?.task}>{data?.task}</Option>
          <Option value="dog">Dog</Option>
          <Option value="cat">Cat</Option>
          <Option value="fish">Fish</Option>
          <Option value="bird">Bird</Option>
        </Select> */}
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
