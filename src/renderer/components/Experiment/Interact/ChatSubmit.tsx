import { useState } from 'react';
import Box from '@mui/joy/Box';
import Button from '@mui/joy/Button';
import FormControl from '@mui/joy/FormControl';
import Textarea from '@mui/joy/Textarea';
import {
  DeleteIcon,
  InfoIcon,
  SaveIcon,
  SendIcon,
  StopCircle,
  XCircleIcon,
  PaperclipIcon,
  XIcon,
  UploadIcon,
  CheckIcon,
} from 'lucide-react';
import {
  CircularProgress,
  Select,
  Tooltip,
  Typography,
  Option,
  Stack,
  IconButton,
  Modal,
  ModalDialog,
  Input,
  FormHelperText,
  Dropdown,
  Menu,
  MenuButton,
  MenuItem,
  ListItemDecorator,
  DialogTitle,
  DialogContent,
  ModalClose,
} from '@mui/joy';

function scrollChatToBottom() {
  document.getElementById('endofchat').scrollIntoView();
}

export default function ChatSubmit({
  addMessage,
  stopStreaming,
  spinner,
  clearHistory,
  tokenCount,
  text,
  debouncedText,
  currentModelArchitecture,
}) {
  const [italic] = useState(false);
  const [fontWeight] = useState('normal');
  const [image, setImage] = useState<File | null>(null);
  const [imageLink, setImageLink] = useState(null);
  const [imageURLInput, setImageURLInput] = useState('');
  const [imageModalOpen, setImageModalOpen] = useState(false);
  const [imageURLModalOpen, setImageURLModalOpen] = useState(false);
  //List of multimodal models we currently support
  const multimodalModelArchitectures = ['LlavaForConditionalGeneration'];
  const handleSend = () => {
    scrollChatToBottom();
    let msg = document.getElementById('chat-input').value;
    document.getElementById('chat-input').value = '';
    document.getElementById('chat-input').focus();
    addMessage(msg, imageLink);
    setImageLink(null);
  };

  function TokenCount() {
    return (
      <>
        <Typography
          level="body-xs"
          sx={{
            ml: 'auto',
            flex: '1',
            display: 'flex',
            justifyContent: 'center',
          }}
          color={
            tokenCount?.tokenCount > tokenCount?.contextLength
              ? 'danger'
              : 'neutral'
          }
        >
          {text !== debouncedText ? (
            <CircularProgress
              color="neutral"
              sx={{
                '--CircularProgress-size': '16px',
                '--CircularProgress-trackThickness': '4px',
                '--CircularProgress-progressThickness': '3px',
                marginRight: '4px',
              }}
            />
          ) : (
            tokenCount?.tokenCount
          )}{' '}
          of {tokenCount?.contextLength} tokens &nbsp;
          <Tooltip title="Approximation only" followCursor>
            <InfoIcon size="12px" />
          </Tooltip>
        </Typography>
      </>
    );
  }

  function SubmitGenerateButton() {
    return (
      <>
        <Stack
          flexDirection="row"
          sx={{ display: 'flex', justifyContent: 'flex-end' }}
        >
          {spinner && (
            <IconButton color="danger">
              <StopCircle onClick={stopStreaming} />
            </IconButton>
          )}
          <Button
            sx={{}}
            color="neutral"
            endDecorator={
              spinner ? (
                <CircularProgress
                  thickness={2}
                  size="sm"
                  color="neutral"
                  sx={{
                    '--CircularProgress-size': '13px',
                  }}
                />
              ) : (
                <SendIcon size="20px" />
              )
            }
            disabled={spinner}
            id="chat-submit-button"
            onClick={handleSend}
          >
            {spinner ? <>Generating</> : 'Submit'}
          </Button>
        </Stack>
      </>
    );
  }

  function AttachImageButton() {
    return (
      <>
        <Dropdown>
          <MenuButton variant="plain">
            <PaperclipIcon size="20px" />
          </MenuButton>
          <Menu>
            <MenuItem
              onClick={() => {
                var input = document.createElement('input');
                input.type = 'file';
                input.multiple = false;
                input.accept =
                  'image/jpeg, image/png, image/gif, image/bmp, image/tiff'; //Only allow image files that are supported
                input.onchange = async (e) => {
                  let file = input.files[0];
                  console.log(file);
                  if (file) {
                    setImage(file);
                    const reader = new FileReader();
                    reader.onload = (e) => {
                      setImageLink(e.target.result);
                    };
                    reader.readAsDataURL(file);
                  }
                };
                input.click();
              }}
            >
              <ListItemDecorator>
                <PaperclipIcon size="20px" />
              </ListItemDecorator>
              From your computer
            </MenuItem>
            <MenuItem
              onClick={() => {
                setImageURLModalOpen(true);
              }}
            >
              <ListItemDecorator>
                <UploadIcon size="20px" />
              </ListItemDecorator>
              From a URL
            </MenuItem>
          </Menu>
        </Dropdown>
      </>
    );
  }

  return (
    <Box
      sx={{
        width: '100%',
        margin: 'auto',
        flexDirection: 'column',
        display: 'flex',
      }}
    >
      {imageLink && (
        <Box
          sx={{
            position: 'relative',
            display: 'inline-block',
            maxWidth: '100px',
            maxHeight: '100px',
            width: 'auto',
            height: 'auto',
            flexShrink: 1,
            overflow: 'hidden',
            marginRight: '10px',
            marginBottom: '5px',
          }}
        >
          <Box
            component="img"
            src={imageLink}
            sx={{
              width: '100%',
              height: 'auto',
            }}
            onClick={() => setImageModalOpen(true)}
            alt="uploaded"
          />
          <IconButton
            size="small"
            onClick={() => setImageLink(null)}
            sx={{
              position: 'absolute',
              top: 0,
              right: 0,
              backgroundColor: 'rgba(0, 0, 0, 0.5)',
              color: 'white',
            }}
          >
            <XIcon size="20px" />
          </IconButton>
        </Box>
      )}{' '}
      {/* {!imageLink &&
        multimodalModelArchitectures.includes(currentModelArchitecture) && (
          <ImageURLInputField />
        )} */}
      <Box
        sx={{
          display: 'flex',
          flexDirection: 'row',
          mb: 1,
          gap: 1,
        }}
      >
        <FormControl sx={{ width: '100%', margin: 'auto', flex: 1 }}>
          <Textarea
            placeholder="Type a message here..."
            minRows={3}
            slotProps={{
              textarea: {
                id: 'chat-input',
                name: 'chat-input',
              },
            }}
            sx={{
              flex: 1,
              fontWeight,
              fontStyle: italic ? 'italic' : 'initial',
            }}
            onKeyDown={(event) => {
              // Support Submit on Enter, but ignore if
              // User types shift-enter
              if (event.shiftKey) return;
              if (event.key === 'Enter') {
                event.preventDefault();
                handleSend();
              }
            }}
            endDecorator={
              <Box
                sx={{
                  display: 'flex',
                  gap: 0.5,
                  flex: 1,
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <IconButton variant="plain" color="neutral">
                  {multimodalModelArchitectures.includes(
                    currentModelArchitecture
                  ) ? (
                    <AttachImageButton />
                  ) : (
                    ' '
                  )}
                </IconButton>
                <TokenCount />
                <SubmitGenerateButton />
              </Box>
            }
          />
          <FormHelperText>
            <Button
              color="neutral"
              variant="plain"
              sx={{
                color: 'text.tertiary',
                justifyContent: 'flex-start',
              }}
              startDecorator={<XCircleIcon size="14px" />}
              onClick={() => {
                clearHistory();
              }}
            >
              Clear Chat History
            </Button>
          </FormHelperText>
        </FormControl>
      </Box>
      <Modal open={imageModalOpen} onClose={() => setImageModalOpen(false)}>
        <ModalDialog
          sx={{
            maxWidth: '90vw',
            maxHeight: '90vh',
            width: 'auto',
            height: 'auto',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Box
            component="img"
            src={imageLink}
            sx={{
              maxWidth: '100%',
              maxHeight: '100%',
              width: 'auto',
              height: 'auto',
            }}
            alt="uploaded large"
          />
        </ModalDialog>
      </Modal>
      <Modal
        open={imageURLModalOpen}
        onClose={() => setImageURLModalOpen(false)}
      >
        <ModalDialog>
          <DialogTitle>Submit Image via URL:</DialogTitle>
          <ModalClose />
          <DialogContent>
            <Box
              sx={{
                position: 'relative',
                display: 'inline-block',
                maxWidth: '500px',
                flexShrink: 1,
                overflow: 'hidden',
                marginBottom: '10px',
              }}
            >
              <Input
                placeholder="Add Image via URL"
                startDecorator={<UploadIcon size="20px" />}
                value={imageURLInput}
                onChange={(e) => setImageURLInput(e.target.value)}
                endDecorator={
                  imageURLInput.length > 0 && (
                    <IconButton
                      variant="soft"
                      color="success"
                      disabled={!imageURLInput.trim()}
                      onClick={() => {
                        //Testing to see if the image is valid
                        const img = new Image();
                        img.src = imageURLInput;
                        img.onload = () => {
                          setImageLink(imageURLInput);
                          setImageURLInput('');
                        };
                        img.onerror = () => {
                          alert('Invalid Image URL. Please input a valid URL.');
                        };
                        setImageURLModalOpen(false);
                        console.log('closing');
                      }}
                    >
                      <CheckIcon size="20px" />
                    </IconButton>
                  )
                }
              ></Input>
            </Box>
          </DialogContent>
        </ModalDialog>
      </Modal>
    </Box>
  );
}
