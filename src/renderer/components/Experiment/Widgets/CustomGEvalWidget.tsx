import React from 'react';
import { WidgetProps } from '@rjsf/core';
import { Button, Input, Select, Option } from '@mui/joy';

type GEvalTask = {
  name: string;
  description: string;
  include_context: string;
};

const parseValue = (val: any): GEvalTask[] => {
  if (Array.isArray(val)) {
    if (val.every(item => typeof item === "string")) {
      try {
        const joined = val.join(',');
        const parsed = JSON.parse(joined);
        return Array.isArray(parsed) ? parsed : [];
      } catch (err) {
        console.error("Error parsing geval tasks widget value:", err);
        return [];
      }
    } else {
      return val;
    }
  } else if (typeof val === "string") {
    try {
      return JSON.parse(val);
    } catch (err) {
      console.error("Error parsing geval tasks widget value string:", err);
      return [];
    }
  }
  return [];
};

const GEvalTasksWidget = (props: WidgetProps<any>) => {
  const { id, value, onChange, disabled, readonly } = props;

  const tasks: GEvalTask[] = React.useMemo(() => parseValue(value), [value]);

  const handleAddTask = () => {
    const updatedTasks = [
      ...tasks,
      { name: '', description: '', include_context: 'No' }
    ];
    onChange(updatedTasks);
  };

  const handleTaskChange = (
    index: number,
    field: keyof GEvalTask,
    newValue: string
  ) => {
    const updated = tasks.map((task, i) =>
      i === index ? { ...task, [field]: newValue } : task
    );
    onChange(updated);
  };

  const handleRemoveTask = (index: number) => {
    const updated = tasks.filter((_, i) => i !== index);
    onChange(updated);
  };

  return (
    <div id={id}>
      {tasks.map((task, index) => (
        <div
          key={index}
          style={{
            marginBottom: '1rem',
            border: '1px solid #ccc',
            padding: '0.5rem'
          }}
        >
          <Input
            placeholder="Evaluation Name"
            value={task.name}
            onChange={(e) =>
              handleTaskChange(index, 'name', e.target.value)
            }
            disabled={disabled || readonly}
            style={{ marginBottom: '0.5rem' }}
          />
          <textarea
            placeholder="Text Description of the Eval providing step by step descriptions"
            value={task.description}
            onChange={(e) =>
              handleTaskChange(index, 'description', e.target.value)
            }
            disabled={disabled || readonly}
            style={{
              marginBottom: '0.5rem',
              width: '100%',
              minHeight: '100px',
              padding: '8px'
            }}
          />
          <Select
            placeholder="Include Context while evaluating?"
            value={task.include_context}
            onChange={(e, newValue) =>
              handleTaskChange(index, 'include_context', newValue as string)
            }
            disabled={disabled || readonly}
            style={{ marginBottom: '0.5rem' }}
          >
            <Option value="Yes">Include Context Field</Option>
            <Option value="No">Don't Include Context Field</Option>
          </Select>
          <Button
            onClick={() => handleRemoveTask(index)}
            disabled={disabled || readonly}
            size="sm"
            variant="outlined"
          >
            Remove Task
          </Button>
        </div>
      ))}
      <Button
        onClick={handleAddTask}
        disabled={disabled || readonly}
        variant="solid"
      >
        Add Task
      </Button>
      <input type="hidden" id={id} name={id} value={JSON.stringify(tasks)} />
    </div>
  );
};

export default GEvalTasksWidget;
