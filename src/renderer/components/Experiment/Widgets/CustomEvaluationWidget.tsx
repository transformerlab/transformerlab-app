import React from 'react';
import { WidgetProps } from '@rjsf/core';
import { Button, Input, Select, Option } from '@mui/joy';

type EvaluationField = {
  name: string;
  expression: string;
  return_type: string;
};

const parseValue = (val: any): EvaluationField[] => {
  if (Array.isArray(val)) {
    if (val.every(item => typeof item === "string")) {
      // If every element is a string: join them and parse the result.
      try {
        const joined = val.join(',');
        const parsed = JSON.parse(joined);
        return Array.isArray(parsed) ? parsed : [];
      } catch (err) {
        console.error("Error parsing evaluation widget value:", err);
        return [];
      }
    } else {
      // If not all elements are strings, assume it's already an array of EvaluationField.
      return val;
    }
  } else if (typeof val === "string") {
    try {
      return JSON.parse(val);
    } catch (err) {
      console.error("Error parsing evaluation widget value string:", err);
      return [];
    }
  }
  return [];
};

const CustomEvaluationWidget = (props: WidgetProps<any>) => {
  const { id, value, onChange, disabled, readonly } = props;

  // Directly derive evaluation metrics from the value prop.
  const evalMetrics: EvaluationField[] = React.useMemo(() => parseValue(value), [value]);

  const handleAddField = () => {
    const updatedMetrics = [
      ...evalMetrics,
      { name: '', expression: '', return_type: 'boolean' }
    ];
    onChange(updatedMetrics);
  };

  const handleFieldChange = (
    index: number,
    field: keyof EvaluationField,
    newValue: string
  ) => {
    const updated = evalMetrics.map((evaluation, i) =>
      i === index ? { ...evaluation, [field]: newValue } : evaluation
    );
    onChange(updated);
  };

  const handleRemoveField = (index: number) => {
    const updated = evalMetrics.filter((_, i) => i !== index);
    onChange(updated);
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
          <textarea
            placeholder="Regular Expression/String"
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
            <Option value="boolean">Boolean (Regex)</Option>
            <Option value="number">Number (Regex)</Option>
            <Option value="contains">Contains</Option>
            <Option value="isequal">IsEqual</Option>
            <Option value="code">Code</Option>
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
