import React from 'react';
import { WidgetProps } from '@rjsf/utils';
import { Button, Input, Select, Option } from '@mui/joy';

type GEvalTask = {
  name: string;
  description: string;
  include_context: string;
  evaluation_steps: string[];
};

const parseValue = (val: any): GEvalTask[] => {
  let result: any[] = [];

  if (Array.isArray(val)) {
    if (val.every((item) => typeof item === 'string')) {
      try {
        const joined = val.join(',');
        const parsed = JSON.parse(joined);
        result = Array.isArray(parsed) ? parsed : [];
      } catch (err) {
        // Error parsing geval tasks widget value
        result = [];
      }
    } else {
      result = val;
    }
  } else if (typeof val === 'string') {
    try {
      result = JSON.parse(val);
    } catch (err) {
      // Error parsing geval tasks widget value string
      result = [];
    }
  }

  // Ensure each task has all required fields including evaluation_steps
  return result.map((task) => ({
    name: task.name || '',
    description: task.description || '',
    include_context: task.include_context || 'No',
    evaluation_steps: Array.isArray(task.evaluation_steps)
      ? task.evaluation_steps
      : [''],
  }));
};

const GEvalTasksWidget = (props: WidgetProps<any>) => {
  const { id, value, onChange, disabled, readonly } = props;

  const tasks: GEvalTask[] = React.useMemo(() => parseValue(value), [value]);

  const handleAddTask = () => {
    const updatedTasks = [
      ...tasks,
      {
        name: '',
        description: '',
        include_context: 'No',
        evaluation_steps: [''],
      },
    ];
    onChange(updatedTasks);
  };

  const handleTaskChange = (
    index: number,
    field: keyof GEvalTask,
    newValue: string | string[],
  ) => {
    const updated = tasks.map((task, i) =>
      i === index ? { ...task, [field]: newValue } : task,
    );
    onChange(updated);
  };

  const handleRemoveTask = (index: number) => {
    const updated = tasks.filter((_, i) => i !== index);
    onChange(updated);
  };

  const handleAddEvaluationStep = (taskIndex: number) => {
    const updated = tasks.map((task, i) =>
      i === taskIndex
        ? { ...task, evaluation_steps: [...task.evaluation_steps, ''] }
        : task,
    );
    onChange(updated);
  };

  const handleEvaluationStepChange = (
    taskIndex: number,
    stepIndex: number,
    newValue: string,
  ) => {
    const updated = tasks.map((task, i) =>
      i === taskIndex
        ? {
            ...task,
            evaluation_steps: task.evaluation_steps.map((step, j) =>
              j === stepIndex ? newValue : step,
            ),
          }
        : task,
    );
    onChange(updated);
  };

  const handleRemoveEvaluationStep = (taskIndex: number, stepIndex: number) => {
    const updated = tasks.map((task, i) =>
      i === taskIndex
        ? {
            ...task,
            evaluation_steps: task.evaluation_steps.filter(
              (_, j) => j !== stepIndex,
            ),
          }
        : task,
    );
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
            padding: '0.5rem',
          }}
        >
          <div
            style={{
              backgroundColor: '#f5f5f5',
              padding: '0.5rem',
              marginBottom: '0.75rem',
              borderRadius: '4px',
              fontSize: '0.9em',
              color: '#555',
            }}
          >
            <strong>Note:</strong> You can provide either a description OR
            evaluation steps (or both). At least one is recommended for better
            evaluation results.
          </div>

          <div style={{ marginBottom: '0.5rem' }}>
            <label
              style={{
                display: 'block',
                marginBottom: '0.25rem',
                fontWeight: 'bold',
              }}
            >
              Evaluation Name:
            </label>
            <Input
              placeholder="Enter evaluation name"
              value={task.name}
              onChange={(e) => handleTaskChange(index, 'name', e.target.value)}
              disabled={disabled || readonly}
            />
          </div>
          <div style={{ marginBottom: '0.5rem' }}>
            <label
              style={{
                display: 'block',
                marginBottom: '0.25rem',
                fontWeight: 'bold',
              }}
            >
              Description:{' '}
              <span
                style={{
                  fontWeight: 'normal',
                  fontStyle: 'italic',
                  color: '#666',
                }}
              >
                (Optional - use this OR evaluation steps below)
              </span>
            </label>
            <textarea
              placeholder="Text Description of the Eval providing step by step descriptions"
              value={task.description}
              onChange={(e) =>
                handleTaskChange(index, 'description', e.target.value)
              }
              disabled={disabled || readonly}
              style={{
                width: '100%',
                minHeight: '100px',
                padding: '8px',
              }}
            />
          </div>

          <div style={{ marginBottom: '0.5rem' }}>
            <label
              style={{
                display: 'block',
                marginBottom: '0.25rem',
                fontWeight: 'bold',
              }}
            >
              Evaluation Steps:{' '}
              <span
                style={{
                  fontWeight: 'normal',
                  fontStyle: 'italic',
                  color: '#666',
                }}
              >
                (Optional - use this OR description above)
              </span>
            </label>
            <div
              style={{
                marginBottom: '0.5rem',
                padding: '0.5rem',
                backgroundColor: '#f9f9f9',
                borderRadius: '4px',
                fontSize: '0.85em',
                color: '#555',
              }}
            >
              <strong>How to use:</strong> Break down your evaluation into
              specific, actionable steps. Each step should describe what to
              analyze or check. For example: "Check if the response answers the
              question directly", "Verify factual accuracy", "Assess tone
              appropriateness".
            </div>
            {(task.evaluation_steps || []).map((step, stepIndex) => (
              <div
                key={`step-${index}-${stepIndex}`}
                style={{
                  display: 'flex',
                  gap: '0.5rem',
                  marginBottom: '0.25rem',
                  alignItems: 'center',
                }}
              >
                <Input
                  placeholder={`Step ${stepIndex + 1}: Describe what to evaluate (e.g., "Check for factual accuracy")`}
                  value={step}
                  onChange={(e) =>
                    handleEvaluationStepChange(index, stepIndex, e.target.value)
                  }
                  disabled={disabled || readonly}
                  style={{ flex: 1 }}
                />
                <Button
                  onClick={() => handleRemoveEvaluationStep(index, stepIndex)}
                  disabled={
                    disabled || readonly || task.evaluation_steps.length <= 1
                  }
                  size="sm"
                  variant="outlined"
                  color="danger"
                >
                  Remove
                </Button>
              </div>
            ))}
            <Button
              onClick={() => handleAddEvaluationStep(index)}
              disabled={disabled || readonly}
              size="sm"
              variant="soft"
              style={{ marginTop: '0.25rem' }}
            >
              Add Evaluation Step
            </Button>
          </div>

          <div style={{ marginBottom: '0.5rem' }}>
            <label
              style={{
                display: 'block',
                marginBottom: '0.25rem',
                fontWeight: 'bold',
              }}
            >
              Include Context:
            </label>
            <Select
              placeholder="Include Context while evaluating?"
              value={task.include_context}
              onChange={(e, newValue) =>
                handleTaskChange(index, 'include_context', newValue as string)
              }
              disabled={disabled || readonly}
            >
              <Option value="Yes">Include Context Field</Option>
              <Option value="No">Don&apos;t Include Context Field</Option>
            </Select>
          </div>

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
