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

  const styles = {
    field: { marginBottom: '1rem' },
    label: { display: 'block', marginBottom: '0.25rem', fontSize: '0.9rem' },
    helper: { fontSize: '0.8rem', color: '#666' },
    task: {
      marginBottom: '1.5rem',
      padding: '1rem',
      border: '1px solid #ddd',
      borderRadius: '6px',
    },
    steps: {
      backgroundColor: '#f8f9fa',
      padding: '0.75rem',
      borderRadius: '4px',
    },
  };

  return (
    <div id={id}>
      {tasks.map((task, index) => (
        <div
          key={`task-${task.name || `task-${Date.now()}-${Math.random()}`}`}
          style={styles.task}
        >
          {/* Task Name */}
          <div style={styles.field}>
            <label htmlFor={`task-name-${index}`} style={styles.label}>
              Evaluation Name
            </label>
            <Input
              id={`task-name-${index}`}
              placeholder="Enter evaluation name"
              value={task.name}
              onChange={(e) => handleTaskChange(index, 'name', e.target.value)}
              disabled={disabled || readonly}
            />
          </div>

          {/* Description */}
          <div style={styles.field}>
            <label htmlFor={`task-description-${index}`} style={styles.label}>
              Description <span style={styles.helper}>(optional)</span>
            </label>
            <textarea
              id={`task-description-${index}`}
              placeholder="Describe what this evaluation should assess..."
              value={task.description}
              onChange={(e) =>
                handleTaskChange(index, 'description', e.target.value)
              }
              disabled={disabled || readonly}
              style={{
                width: '100%',
                minHeight: '80px',
                padding: '8px',
                borderRadius: '4px',
                border: '1px solid #ccc',
                fontSize: '14px',
                fontFamily: 'inherit',
                resize: 'vertical',
              }}
            />
          </div>

          {/* Evaluation Steps */}
          <div style={styles.field}>
            <label style={styles.label}>
              Evaluation Steps <span style={styles.helper}>(optional)</span>
            </label>
            <div style={styles.steps}>
              {(task.evaluation_steps || []).map((step, stepIndex) => (
                <div
                  key={`step-${step || `empty-${Date.now()}-${Math.random()}`}`}
                  style={{
                    display: 'flex',
                    gap: '8px',
                    marginBottom: '8px',
                    alignItems: 'center',
                  }}
                >
                  <Input
                    placeholder={`Step ${stepIndex + 1}: e.g., "Check if the response is factually accurate"`}
                    value={step}
                    onChange={(e) =>
                      handleEvaluationStepChange(
                        index,
                        stepIndex,
                        e.target.value,
                      )
                    }
                    disabled={disabled || readonly}
                    style={{ flex: 1 }}
                    size="sm"
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
                    ×
                  </Button>
                </div>
              ))}
              <Button
                onClick={() => handleAddEvaluationStep(index)}
                disabled={disabled || readonly}
                size="sm"
                variant="soft"
                color="primary"
              >
                + Add Step
              </Button>
            </div>
          </div>

          {/* Include Context */}
          <div style={styles.field}>
            <label htmlFor={`task-context-${index}`} style={styles.label}>
              Include Context During Evaluation?
            </label>
            <Select
              value={task.include_context}
              onChange={(e, newValue) =>
                handleTaskChange(index, 'include_context', newValue as string)
              }
              disabled={disabled || readonly}
            >
              <Option value="Yes">Yes</Option>
              <Option value="No">No</Option>
            </Select>
          </div>

          {/* Remove Task */}
          {tasks.length > 1 && (
            <Button
              onClick={() => handleRemoveTask(index)}
              disabled={disabled || readonly}
              size="sm"
              variant="outlined"
              color="danger"
            >
              Remove Task
            </Button>
          )}
        </div>
      ))}

      <Button
        onClick={handleAddTask}
        disabled={disabled || readonly}
        variant="solid"
        color="primary"
      >
        + Add Task
      </Button>

      <input type="hidden" id={id} name={id} value={JSON.stringify(tasks)} />
    </div>
  );
};

export default GEvalTasksWidget;
