import {
  Modal,
  ModalDialog,
  Stack,
  Typography,
  Tab,
  TabList,
  TabPanel,
  Tabs,
  FormControl,
  FormLabel,
  Input,
  Button,
  Alert,
} from '@mui/joy';

import {
  login,
} from 'renderer/lib/transformerlab-api-sdk';

export default function UserLoginModal({ open, setOpen, onClose }) {
  const commonTabPanelSx = {
    p: 1,
    pt: 4,
    width: '100%',
    maxWidth: '400px',
    mx: 'auto'
  };

  const descriptionAlertSx = {
    display: 'flex',
    justifyContent: 'center',
    mb: 2
  };

  return (
    <Modal open={open} onClose={onClose}>
      <ModalDialog
        sx={{
          top: '5vh',
          margin: 'auto',
          transform: 'translateX(-50%)',
          width: '80vw',
          maxWidth: '600px',
          height: '90vh',
        }}
      >
        <Tabs defaultValue="login">
          <TabList tabFlex={1}>
            <Tab value="login">Login</Tab>
            <Tab value="register">Register New User</Tab>
          </TabList>

          <TabPanel value="login" sx={commonTabPanelSx}>
            <Alert variant="plain" sx={descriptionAlertSx}>
              <Typography level="body-sm" textColor="text.tertiary">
                Login with your existing account credentials.
              </Typography>
            </Alert>
            <form
              onSubmit={async (event) => {
                event.preventDefault();
                // Handle login logic here
                const result = await login("test@transformerlab.ai", "strawberrry");
                console.log("Login attempt:");
                console.log(result);
                setOpen(false);
              }}
            >
              <Stack spacing={2}>
                <FormControl>
                  <FormLabel>Email</FormLabel>
                  <Input
                    name="email"
                    type="email"
                    autoFocus
                    required
                    placeholder="user@example.com"
                  />
                </FormControl>
                <FormControl>
                  <FormLabel>Password</FormLabel>
                  <Input
                    name="password"
                    type="password"
                    required
                    placeholder="Enter your password"
                  />
                </FormControl>
                <Button type="submit">Login</Button>
              </Stack>
            </form>
          </TabPanel>

          <TabPanel value="register" sx={commonTabPanelSx}>
            <Alert variant="plain" sx={descriptionAlertSx}>
              <Typography level="body-sm" textColor="text.tertiary">
                Create a new account to get started.
              </Typography>
            </Alert>
            <form
              onSubmit={(event) => {
                event.preventDefault();
                // Handle registration logic here
              }}
            >
              <Stack spacing={2}>
                <FormControl>
                  <FormLabel>Name</FormLabel>
                  <Input
                    name="name"
                    autoFocus
                    required
                    placeholder="Enter your name"
                  />
                </FormControl>
                <FormControl>
                  <FormLabel>Email</FormLabel>
                  <Input
                    name="email"
                    type="email"
                    required
                    placeholder="user@example.com"
                  />
                </FormControl>
                <FormControl>
                  <FormLabel>Password</FormLabel>
                  <Input
                    name="password"
                    type="password"
                    required
                    placeholder="Create a password"
                  />
                </FormControl>
                <Button type="submit">Register</Button>
              </Stack>
            </form>
          </TabPanel>
        </Tabs>
      </ModalDialog>
    </Modal>
  );
}