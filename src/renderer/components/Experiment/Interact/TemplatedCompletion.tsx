import {
  Button,
  CircularProgress,
  Select,
  Sheet,
  Textarea,
  Option,
  Typography,
  FormLabel,
  Box,
  Stack,
  Chip,
  Tabs,
  TabList,
  Tab,
  TabPanel,
} from '@mui/joy';
import { SendIcon, PlusCircleIcon } from 'lucide-react';
import { useState } from 'react';

import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

import useSWR from 'swr';

import * as chatAPI from 'renderer/lib/transformerlab-api-sdk';

/* We hardcode these below but later on we will fetch them from the API */
const templates = [
  {
    id: 'a',
    style: 'completion',
    title: 'Convert to Standard English',
    template:
      'You will be provided with a statement, and your task is to convert it to standard English.\n\nStatement:\n\n{text}\n\nStandard English:\n',
    temperature: 0.7,
    max_tokens: 64,
    top_p: 1,
  },
  {
    id: 'b',
    style: 'completion',
    title: 'Summarize for Second-Grade Student',
    template:
      'Summarize content you are provided with for a second-grade student.\n\nContent:\n{text}\n\nSummary:\n',
  },
  {
    id: 'c',
    style: 'completion',
    title: 'Convert CSV to Markdown Table',
    template:
      'You are an expert in data formatting. For the following csv data, output it as a markdown table.\nOutput the table only.\n```{text}```',
  },
  {
    id: 'd',
    style: 'completion',
    title: 'Parse Unstructured Data',
    template:
      'You are a data scientist tasked with parsing unstructured data. Given the following text, output the structured data.\n\n{text}\n\nStructured Data:\n',
  },
  {
    id: 'e',
    style: 'completion',
    title: 'Write a Summary',
    template:
      'You are a journalist tasked with writing a summary of the following text.\n\n{text}\n\nSummary:\n',
  },
];

const fetcher = (url) => fetch(url).then((res) => res.json());

export default function TemplatedCompletion({ experimentInfo }) {
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [showTemplate, setShowTemplate] = useState(false);
  const [isThinking, setIsThinking] = useState(false);
  const [timeTaken, setTimeTaken] = useState<number | null>(null);
  const [outputText, setOutputText] = useState('');

  const { data: templates } = useSWR(chatAPI.Endpoints.Prompts.List(), fetcher);

  const sendTemplatedCompletionToLLM = async (element, target) => {
    if (!selectedTemplate) {
      return;
    }

    const text = element.value;

    const template = templates.find((t) => t.id === selectedTemplate);

    if (!template) {
      alert('Template not found');
      return;
    }

    const completionText = template.text.replace('{text}', text);
    setOutputText('');

    setIsThinking(true);

    var inferenceParams = '';

    if (experimentInfo?.config?.inferenceParams) {
      inferenceParams = experimentInfo?.config?.inferenceParams;
      inferenceParams = JSON.parse(inferenceParams);
    }

    console.log(inferenceParams);

    const generationParamsJSON = experimentInfo?.config?.generationParams;
    const generationParameters = JSON.parse(generationParamsJSON);

    try {
      generationParameters.stop_str = JSON.parse(
        generationParameters?.stop_str
      );
    } catch (e) {
      console.log('Error parsing stop strings as JSON');
    }

    const result = await chatAPI.sendCompletion(
      experimentInfo?.config?.foundation,
      experimentInfo?.config?.adaptor,
      completionText,
      generationParameters?.temperature,
      generationParameters?.maxTokens,
      generationParameters?.topP,
      false,
      generationParameters?.stop_str,
      target
    );

    setOutputText(result?.text || '');
    setIsThinking(false);
  };

  return (
    <Sheet
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        gap: '1rem',
        paddingBottom: '10px',
        height: '100%',
        overflow: 'hidden',
        justifyContent: 'space-between',
        paddingTop: '1rem',
      }}
    >
      <div>
        {/* {JSON.stringify(templates)} */}
        <FormLabel>Prompt Template:</FormLabel>
        <Select
          placeholder="Select Template"
          variant="soft"
          name="template"
          value={selectedTemplate}
          onChange={(e, newValue) => {
            setSelectedTemplate(newValue);
          }}
          renderValue={(selected) => {
            const value = selected?.value;
            return (
              templates?.find((t) => t.id === value)?.title || 'Select Template'
            );
          }}
          required
          sx={{ minWidth: 200, marginTop: '5px' }}
        >
          {templates?.map((template) => (
            <Option key={template.id} value={template.id}>
              <Chip color="warning">gallery</Chip>
              {template.title}
            </Option>
          ))}
          <Option value="custom">
            <PlusCircleIcon /> Create New Prompt
          </Option>
        </Select>
      </div>
      {selectedTemplate && (
        <>
          <Typography
            level="body-xs"
            onClick={() => {
              setShowTemplate(!showTemplate);
            }}
            sx={{
              cursor: 'pointer',
              color: 'primary',
              textAlign: 'right',
            }}
          >
            {showTemplate ? 'Hide Template' : 'Show Template'}
          </Typography>
          {showTemplate && (
            <>
              <Sheet
                variant="plain"
                color="neutral"
                sx={{
                  padding: '0 1rem',
                  maxHeight: '400px',
                  // borderLeft: '2px solid var(--joy-palette-neutral-500)',
                  overflow: 'auto',
                }}
              >
                <Typography level="body-md" color="neutral">
                  <pre
                    style={{
                      whiteSpace: 'pre-wrap',
                      fontSize: '14px',
                      fontFamily: 'var(--joy-fontFamily-code)',
                    }}
                  >
                    {selectedTemplate
                      ? templates.find((t) => t.id === selectedTemplate).text
                      : ''}
                  </pre>
                </Typography>
              </Sheet>
            </>
          )}

          <Sheet
            variant="outlined"
            sx={{
              flex: 1,
              overflow: 'auto',
              padding: 2,
              margin: 'auto',
              flexDirection: 'column',
              width: '100%',
            }}
          >
            <Textarea
              placeholder=""
              variant="plain"
              name="completion-text"
              minRows={4}
              sx={{
                display: 'flex',
                flex: 1,
                '--Textarea-focusedThickness': '0px',
                '& textarea': {
                  overflow: 'auto',
                },
              }}
            />
          </Sheet>
          <Stack direction="row">
            <div>
              {timeTaken && timeTaken !== -1 && (
                <Typography level="body-sm" color="neutral">
                  Time taken: {Math.round(timeTaken)}ms
                </Typography>
              )}
              {timeTaken == -1 && <CircularProgress size="sm" />}
            </div>
            <Button
              sx={{ ml: 'auto' }}
              color="neutral"
              endDecorator={
                isThinking ? (
                  <CircularProgress
                    thickness={2}
                    size="sm"
                    color="neutral"
                    sx={{
                      '--CircularProgress-size': '13px',
                    }}
                  />
                ) : (
                  <SendIcon />
                )
              }
              disabled={isThinking}
              id="chat-submit-button"
              onClick={async () => {
                setTimeTaken(-1);
                const startTime = performance.now();

                document.getElementsByName('output-text')[0].value = '';
                sendTemplatedCompletionToLLM(
                  document.getElementsByName('completion-text')?.[0],
                  document.getElementsByName('output-text')?.[0]
                );

                const endTime = performance.now();
                setTimeTaken(endTime - startTime);
              }}
            >
              {isThinking ? 'Answering' : 'Answer'}
            </Button>
          </Stack>
          <Sheet
            variant="plain"
            sx={{
              padding: '2rem 1rem',
              flex: 2,
              overflow: 'auto',
            }}
            id="completion-output"
          >
            <Tabs>
              <TabList>
                <Tab variant="plain" color="neutral">
                  Raw
                </Tab>
                <Tab>Markdown</Tab>
              </TabList>
              <TabPanel value={0} keepMounted>
                <Box
                  sx={{
                    paddingLeft: 2,
                    borderLeft: '2px solid var(--joy-palette-neutral-500)',
                  }}
                >
                  <Textarea name="output-text" variant="plain"></Textarea>
                </Box>
              </TabPanel>
              <TabPanel value={1} keepMounted>
                <Box
                  sx={{
                    paddingLeft: 2,
                    borderLeft: '2px solid var(--joy-palette-neutral-500)',
                  }}
                >
                  {isThinking && <CircularProgress />}
                  <Markdown
                    children={outputText}
                    remarkPlugins={[remarkGfm]}
                    className="editableSheetContent"
                  ></Markdown>
                </Box>
              </TabPanel>
            </Tabs>
          </Sheet>
        </>
      )}
    </Sheet>
  );
}
