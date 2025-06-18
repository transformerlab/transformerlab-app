import * as chatAPI from '../../../lib/transformerlab-api-sdk';
import { Box, Typography, Chip, Table, Sheet } from '@mui/joy';
import useSWR from 'swr';

interface ConversationTemplate {
  system_template: string;
  system_message: string;
  roles: [string, string];
  sep: string;
  sep2: string | null;
  stop_str: string;
  stop_token_ids: number[];
}

interface ChatTemplateSectionProps {
  modelName: string;
}

const fetcher = async ([url, body]: [string, any]) => {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(`Error ${response.status}: ${response.statusText}`);
  }

  return response.json();
};

const hf_translate = (key: string) => {
  const map: Record<string, string | null> = {
    system_template: "System Template",
    system_message: "System Message",
    roles: "Roles",
    sep: "Separator",
    sep2: "Separator 2",
    stop_str: "Stop String",
    stop_token_ids: "Stop Token IDs",
  };
  return map[key] ?? null;
};

export const ChatTemplateSection = ({ modelName }: ChatTemplateSectionProps) => {
  const actualModelName = modelName?.split('/')[0] || '';
  const url = `${chatAPI.INFERENCE_SERVER_URL()}api/model/chat-template`;
  const shouldFetch = !!actualModelName;

  const { data, error, isLoading } = useSWR(
    shouldFetch ? [url, { model_name: actualModelName }] : null,
    fetcher
  );

  if (isLoading || !data) return null;
  if (error) {
    console.error('Error fetching template:', error);
    return null;
  }

  const template: ConversationTemplate = data.template;

  return (
    <Sheet
      variant="outlined"
      sx={{
        p: 2,
        borderRadius: 'md',
        overflow: 'auto',
        maxHeight: '500px',
      }}
    >
      {Object.keys(template).length === 0 ? (
        <Typography level="body-sm" color="neutral" sx={{ p: 2 }}>
          Chat Template configuration is not available for this model.
        </Typography>
      ) : (
        <Table id="chat-template-config-table">
          <tbody>
            {Object.entries(template).map(
              (row) =>
                hf_translate(row[0]) !== null && (
                  <tr key={row[0]}>
                    <td>{hf_translate(row[0])}</td>
                    <td>{JSON.stringify(row[1])}</td>
                  </tr>
                )
            )}
          </tbody>
        </Table>
      )}
    </Sheet>
  );
};
