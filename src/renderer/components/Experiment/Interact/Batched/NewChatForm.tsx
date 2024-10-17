import {
  Box,
  FormControl,
  FormLabel,
  Input,
  Select,
  Option,
  IconButton,
  Button,
  Typography,
  ButtonGroup,
} from '@mui/joy';
import {
  CheckIcon,
  PencilIcon,
  PlusCircleIcon,
  Trash2Icon,
} from 'lucide-react';
import { useEffect, useState } from 'react';

export default function NewChatForm({ submitChat, defaultChats = [] }) {
  const [chats, setChats] = useState([
    { role: 'system', content: 'You are a helpful assistant.' },
    { role: 'user', content: 'Hello!' },
  ]);

  function systemMessageValue() {
    return chats.find((chat) => chat.role === 'system')?.content;
  }

  function editSystemMessageValue(value) {
    const newChats = [...chats];
    const systemMessageIndex = newChats.findIndex(
      (chat) => chat.role === 'system'
    );
    newChats[systemMessageIndex].content = value;
    setChats(newChats);
  }

  useEffect(() => {
    if (defaultChats.length > 0) {
      setChats(defaultChats);
    }
  }, []);

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        gap: 2,
        overflowY: 'auto',
        padding: 1,
        minWidth: '50vw',
      }}
    >
      <FormControl>
        <FormLabel>System Message</FormLabel>
        <Input
          value={systemMessageValue()}
          onChange={(event) => editSystemMessageValue(event.target.value)}
        />
      </FormControl>
      {chats.map((chat, index) => (
        <SingleLineOfChat
          key={index}
          index={index}
          chat={chat}
          chats={chats}
          setChats={setChats}
          setAsEditable={index == chats.length - 1}
        />
      ))}

      <Button
        variant="soft"
        sx={{ alignSelf: 'flex-end' }}
        endDecorator={<PlusCircleIcon />}
        onClick={() => {
          setChats([
            ...chats,
            {
              role:
                chats?.[chats?.length - 1].role == 'user'
                  ? 'assistant'
                  : 'user',
              content: '',
            },
          ]);
        }}
      >
        Add Line
      </Button>

      <Button
        sx={{ mt: 1 }}
        onClick={() => {
          submitChat(chats);
        }}
      >
        Save
      </Button>
    </Box>
  );
}

function SingleLineOfChat({ index, chat, chats, setChats, setAsEditable }) {
  const [isEditing, setIsEditing] = useState(true);

  useEffect(() => {
    if (setAsEditable) {
      setIsEditing(true);
    }
  }, []);

  // Don't display the system message
  if (chat?.role === 'system') {
    return null;
  }

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'row',
        gap: 2,
        alignItems: 'center',
      }}
    >
      {isEditing ? (
        <Select
          value={chat.role}
          sx={{ minWidth: '120px' }}
          onChange={(event, newValue) => {
            const newChats = [...chats];
            newChats[index].role = newValue;
            setChats(newChats);
          }}
          // color={chat.role === 'user' ? 'primary' : 'neutral'}
          variant={chat.role === 'user' ? 'soft' : 'outlined'}
        >
          <Option value="user">Human</Option>
          <Option value="assistant">Assistant</Option>
        </Select>
      ) : (
        <Typography
          color={chat.role === 'user' ? 'primary' : 'primary'}
          sx={{ minWidth: '120px' }}
        >
          {chat.role === 'user' ? 'Human:' : 'Assistant:'}
        </Typography>
      )}{' '}
      {isEditing ? (
        <Input
          sx={{ flex: 1 }}
          value={chat.content}
          onChange={(event) => {
            const newChats = [...chats];
            newChats[index].content = event.target.value;
            setChats(newChats);
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              setIsEditing(false);
            }
          }}
          endDecorator={}
        />
      ) : (
        <Typography sx={{ flex: 1 }}>{chat.content}</Typography>
      )}
      <ButtonGroup>
        {/* {isEditing ? (
          <IconButton
            variant="outlined"
            color="success"
            onClick={() => setIsEditing(false)}
          >
            <CheckIcon />
          </IconButton>
        ) : (
          <IconButton
            variant="outlined"
            color="primary"
            onClick={() => setIsEditing(true)}
          >
            <PencilIcon size="18px" />
          </IconButton>
        )} */}
        <IconButton
          variant="outlined"
          color="danger"
          onClick={() => {
            const newChats = [...chats];
            newChats.splice(index, 1);
            setChats(newChats);
          }}
        >
          <Trash2Icon size="18px" />
        </IconButton>
      </ButtonGroup>
    </Box>
  );
}
