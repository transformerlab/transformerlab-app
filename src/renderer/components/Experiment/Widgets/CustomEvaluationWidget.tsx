import React from 'react';
import { WidgetProps } from '@rjsf/core';
import {
  Button,
  Input,
  Select,
  Option,
  Textarea
} from '@mui/joy';

type EvaluationField = {
  name: string;
  expression: string;
  return_type: 'boolean' | 'number';
};



const CustomEvaluationWidget = (props: WidgetProps<any>) => {
  const { id, value, onChange, disabled, readonly } = props;

  const [evalMetrics, setEvalMetrics] = React.useState<EvaluationField[]>([]);

  // let newValue = value;
  // if (typeof value === 'string') {
  //   try {
  //     newValue = [];
  //   } catch (e) {
  //     newValue = [];
  //   }

  // } else if (Array.isArray(value) && value.length > 0) {
  //   if (typeof value[0] === 'string') {
  //     newValue = JSON.parse(value.join(','));
  //   }
  // }


  // console.log("newValue", newValue);

  // Initialize the state as an empty array without using the value prop.

  // console.log("value", value);
  // // Update the state when the value prop changes.
  // React.useEffect(() => {
  //   if (value && JSON.stringify(value) !== JSON.stringify(evalMetrics)) {
  //     setEvalMetrics(newValue);
  //   }
  // }
  // , [value]);

  // Propagate state changes upstream.
  React.useEffect(() => {
    onChange(evalMetrics);
  }, [evalMetrics]);

  const handleAddField = () => {
    setEvalMetrics([
      ...evalMetrics,
      { name: '', expression: '', return_type: 'boolean' }
    ]);
  };

  const handleFieldChange = (
    index: number,
    field: keyof EvaluationField,
    newValue: string
  ) => {
    const updated = evalMetrics.map((evaluation, i) =>
      i === index ? { ...evaluation, [field]: newValue } : evaluation
    );
    setEvalMetrics(updated);
  };

  const handleRemoveField = (index: number) => {
    const updated = evalMetrics.filter((_, i) => i !== index);
    setEvalMetrics(updated);
  };

  return (
    <div id={id}>
      {evalMetrics.map((evaluation, index) => (
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
            value={evaluation.name}
            onChange={(e) =>
              handleFieldChange(index, 'name', e.target.value)
            }
            disabled={disabled || readonly}
            style={{ marginBottom: '0.5rem' }}
          />
          <Textarea
            placeholder="Regular Expression"
            value={evaluation.expression}
            onChange={(e) =>
              handleFieldChange(index, 'expression', e.target.value)
            }
            disabled={disabled || readonly}
            style={{ marginBottom: '0.5rem' }}
          />
          <Select
            placeholder="Output Type"
            value={evaluation.return_type}
            onChange={(e, newValue) =>
              handleFieldChange(index, 'return_type', newValue as string)
            }
            disabled={disabled || readonly}
            style={{ marginBottom: '0.5rem' }}
          >
            <Option value="boolean">Boolean</Option>
            <Option value="number">Number</Option>
          </Select>
          <Button
            onClick={() => handleRemoveField(index)}
            disabled={disabled || readonly}
            size="sm"
            variant="outlined"
          >
            Remove Field
          </Button>
        </div>
      ))}
      <Button
        onClick={handleAddField}
        disabled={disabled || readonly}
        variant="solid"
      >
        Add Field
      </Button>
      {/* Hidden input to capture the JSON result on form submission */}
      <input type="hidden" id={id} name={id} value={JSON.stringify(evalMetrics)} />
    </div>
  );
};

export default CustomEvaluationWidget;
