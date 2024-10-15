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
import { CheckIcon, PencilIcon, Trash2Icon } from 'lucide-react';
import { useState } from 'react';

export default function NewChatForm({ submitChat }) {
  const [chats, setChats] = useState([
    { user: 'human', t: 'Hello' },
    { user: 'assistant', t: 'Hi there!' },
  ]);

  const [nextChat, setNextChat] = useState({ user: 'human', t: '' });

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        gap: 2,
        overflowY: 'auto',
        maxHeight: '50vh',
        padding: 2,
        minWidth: '50vw',
      }}
    >
      <FormControl>
        <FormLabel>System Message</FormLabel>
        <Input placeholder="You are a friendly chatbot" />
      </FormControl>
      {chats.map((chat, index) => (
        <SingleLineOfChat
          key={index}
          index={index}
          chat={chat}
          chats={chats}
          setChats={setChats}
        />
      ))}
      <Box
        sx={{
          display: 'flex',
          flexDirection: 'row',
          gap: 2,
          alignItems: 'center',
        }}
      >
        <Select
          value={nextChat.user}
          sx={{ minWidth: '120px' }}
          variant="soft"
          onChange={(event, newValue) => {
            setNextChat({ user: newValue, t: nextChat.t });
          }}
        >
          <Option value="human">Human</Option>
          <Option value="assistant">Assistant</Option>
        </Select>
        <Input
          sx={{ flex: 1 }}
          placeholder="Type a message..."
          value={nextChat.t}
          onChange={(event) =>
            setNextChat({ user: nextChat.user, t: event.target.value })
          }
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              setChats([...chats, nextChat]);
              setNextChat({
                user: nextChat?.user == 'human' ? 'assistant' : 'human',
                t: '',
              });
            }
          }}
        />{' '}
        <IconButton
          variant="plain"
          color="success"
          onClick={(event) => {
            setChats([...chats, nextChat]);
            setNextChat({
              user: nextChat?.user == 'human' ? 'assistant' : 'human',
              t: '',
            });
          }}
        >
          <CheckIcon />
        </IconButton>
      </Box>
      <Button sx={{ mt: 3 }} onClick={() => submitChat(chats)}>
        Save
      </Button>
    </Box>
  );
}

function SingleLineOfChat({ index, chat, chats, setChats }) {
  const [isEditing, setIsEditing] = useState(false);
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
          value={chat.user}
          sx={{ minWidth: '120px' }}
          variant="soft"
          onChange={(event, newValue) => {
            const newChats = [...chats];
            newChats[index].user = newValue;
            setChats(newChats);
          }}
        >
          <Option value="human">Human</Option>
          <Option value="assistant">Assistant</Option>
        </Select>
      ) : (
        <Typography
          color={chat.user === 'human' ? 'primary' : 'primary'}
          sx={{ minWidth: '120px' }}
        >
          {chat.user === 'human' ? 'Human:' : 'Assistant:'}
        </Typography>
      )}{' '}
      {isEditing ? (
        <Input
          sx={{ flex: 1 }}
          value={chat.t}
          onChange={(event) => {
            const newChats = [...chats];
            newChats[index].t = event.target.value;
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
        <Typography sx={{ flex: 1 }}>{chat.t}</Typography>
      )}
      <ButtonGroup>
        {isEditing ? (
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
        )}
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
