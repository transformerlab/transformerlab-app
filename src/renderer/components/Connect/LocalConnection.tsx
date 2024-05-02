import {
  Button,
  ButtonGroup,
  Chip,
  CircularProgress,
  Sheet,
  Stack,
  Step,
  StepIndicator,
  Stepper,
  Typography,
} from '@mui/joy';
import { CheckCircle2, PlayIcon, RotateCcwIcon } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useCheckLocalConnection } from 'renderer/lib/transformerlab-api-sdk';
import { FaApple } from 'react-icons/fa6';
import {
  LocalConnectionProvider,
  useLocalConnectionContext,
} from './context/localConnectionContext';
import { setIntervalXTimes, isStep, Steps } from './utils';
import { Message } from './types/Message';

function CheckIfInstalled() {
  const { activeStep, setActiveStep } = useLocalConnectionContext();

  const [installStatus, setInstallStatus] = useState('notstarted'); // notstarted, pending, success, error
  const [installErrorMessage, setInstallErrorMessage] = useState<string | null>(
    null
  );

  useEffect(() => {
    if (!isStep(activeStep)) return;
    (async () => {
      // First check if there are any system requirement issues
      // If not, then check if installed locally
      // Report on any errors along the way
      window.electron.ipcRenderer
        .invoke('server:checkSystemRequirements')
        .then((setupMessage) => {
          if (setupMessage) {
            throw new Error(setupMessage);
          }
          return window.electron.ipcRenderer.invoke(
            'server:checkIfInstalledLocally'
          );
        })
        .then((serverIsInstalled) => {
          if (serverIsInstalled) {
            setInstallStatus('success');
            setActiveStep(Steps.indexOf('CHECK_IF_INSTALLED') + 1);
          } else {
            setInstallStatus('notstarted');
          }
          return;
        })
        .catch((error) => {
          setInstallStatus('error');
          setInstallErrorMessage(error.message);
        });
    })();
  }, [activeStep]);

  return (
    <>
      <Stack spacing={1}>
        {/* <Typography level="body-sm">
          Check if Transformer Lab API is installed on your computer
        </Typography> */}
        {installStatus === 'pending' && <CircularProgress color="primary" />}
        {installStatus === 'notstarted' && (
          <Chip color="danger" variant="outlined">
            Not Installed
          </Chip>
        )}
        {installStatus === 'success' && <Chip color="success">Success!</Chip>}
        {installStatus === 'error' && (
          <>
            <Chip color="danger">Error </Chip>
            <Typography level="body-sm" color="danger">
              {installErrorMessage}
            </Typography>
          </>
        )}

        <ButtonGroup variant="plain" spacing={1}>
          {activeStep == Steps.indexOf('CHECK_IF_INSTALLED') &&
            installStatus == 'notstarted' && (
              <Button
                variant="solid"
                onClick={async () => {
                  await window.electron.ipcRenderer.invoke(
                    'server:InstallLocally'
                  );
                  setInstallStatus('pending');
                  setIntervalXTimes(
                    async () => {
                      const serverIsInstalled =
                        await window.electron.ipcRenderer.invoke(
                          'server:checkIfInstalledLocally'
                        );
                      if (serverIsInstalled) {
                        setInstallStatus('success');
                        setActiveStep(Steps.indexOf('CHECK_IF_INSTALLED') + 1);
                        return true;
                      }
                      return false;
                    },
                    () => {
                      setInstallStatus('error');
                    },
                    2000,
                    8
                  );
                }}
              >
                Install Transformer Lab Server API
              </Button>
            )}
        </ButtonGroup>
      </Stack>
    </>
  );
}

function CheckCurrentVersion() {
  const { activeStep = 0, setActiveStep } = useLocalConnectionContext();

  const [version, setVersion] = useState('pending'); // pending, or #.#.#
  const [release, setRelease] = useState('');
  const [installStatus, setInstallStatus] = useState('notstarted'); // notstarted, pending, success, error

  useEffect(() => {
    if (activeStep !== Steps.indexOf('CHECK_VERSION')) return;

    (async () => {
      const ver = await window.electron.ipcRenderer.invoke(
        'server:checkLocalVersion'
      );
      setVersion(ver);

      const rel = await fetch(
        'https://api.github.com/repos/transformerlab/transformerlab-api/releases/latest'
      );
      const json = await rel.json();
      const tag = json.tag_name;

      setRelease(tag);

      if (ver === tag) {
        setActiveStep(Steps.indexOf('CHECK_VERSION') + 1);
      }
    })();
  }, [activeStep]);

  return (
    <>
      <Stack spacing={1}>
        {activeStep >= Steps.indexOf('CHECK_VERSION') && (
          <>
            <Typography level="body-sm">
              Your version of Transformer Lab API is {version}
            </Typography>
            <Typography level="body-sm">
              Latest release in Github is {release}
            </Typography>
            {(installStatus === 'pending' || release == '') && (
              <CircularProgress color="primary" />
            )}
          </>
        )}
        {version == release && <Chip color="success">Success!</Chip>}

        {activeStep == Steps.indexOf('CHECK_VERSION') && release != '' && (
          <ButtonGroup variant="plain" spacing={1}>
            <Button
              variant="solid"
              size="sm"
              startDecorator={<RotateCcwIcon size="16px" />}
              onClick={async () => {
                await window.electron.ipcRenderer.invoke(
                  'server:InstallLocally'
                );
                setInstallStatus('pending');
                setIntervalXTimes(
                  async () => {
                    const ver = await window.electron.ipcRenderer.invoke(
                      'server:checkLocalVersion'
                    );
                    if (ver === release) {
                      setInstallStatus('success');
                      setVersion(ver);
                      setActiveStep(Steps.indexOf('CHECK_VERSION') + 1);
                      return true;
                    }
                    return false;
                  },
                  () => {
                    setInstallStatus('error');
                  },
                  2000,
                  8
                );
              }}
            >
              Update Server API
            </Button>
            <Button
              variant="plain"
              size="sm"
              onClick={() => {
                setActiveStep(Steps.indexOf('CHECK_VERSION') + 1);
              }}
            >
              Skip
            </Button>
          </ButtonGroup>
        )}
      </Stack>
    </>
  );
}

function RunServer() {
  const { activeStep, setActiveStep } = useLocalConnectionContext();

  const [thinking, setThinking] = useState(false);
  const {
    server,
    isLoading: serverIsLoading,
    error: serverError,
  } = useCheckLocalConnection();

  useEffect(() => {
    if (activeStep !== Steps.indexOf('CHECK_IF_SERVER_RUNNING_ON_PORT_8000'))
      return;

    if (server && !serverError) {
      console.log('The server is up; I think things are good');
      setActiveStep(Steps.indexOf('CHECK_IF_SERVER_RUNNING_ON_PORT_8000') + 1);
      return;
    } else {
      setIntervalXTimes(
        async () => {
          if (!server || serverError) return false;
          setActiveStep(
            Steps.indexOf('CHECK_IF_SERVER_RUNNING_ON_PORT_8000') + 1
          );
          return true;
        },
        () => {},
        2000,
        8
      );
    }
  }, [activeStep, server]);

  return (
    <Stack spacing={1}>
      {activeStep >= Steps.indexOf('CHECK_IF_SERVER_RUNNING_ON_PORT_8000') &&
        server &&
        !serverError && <Chip color="success">Success!</Chip>}
      {activeStep >= Steps.indexOf('CHECK_IF_SERVER_RUNNING_ON_PORT_8000') &&
        (!server || serverError) && <Chip color="danger">Not Running</Chip>}
      <ButtonGroup variant="plain" spacing={1}>
        {activeStep == Steps.indexOf('CHECK_IF_SERVER_RUNNING_ON_PORT_8000') &&
          (!server || serverError ? (
            thinking ? (
              <CircularProgress color="primary" />
            ) : (
              <>
                <Button
                  variant="solid"
                  onClick={async () => {
                    setThinking(true);
                    const start_process =
                      await window.electron.ipcRenderer.invoke(
                        'server:startLocalServer'
                      );

                    if (start_process?.status == 'error') {
                      const response_text =
                        'Failed to start server: \n' + start_process?.message;
                      alert(response_text);
                      setThinking(false);
                      return;
                    }
                    //set interval to check if server is running every 2 seconds, 15 times:
                    setIntervalXTimes(
                      async () => {
                        if (!server || serverError) return false;
                        setThinking(false);
                        setActiveStep(
                          Steps.indexOf(
                            'CHECK_IF_SERVER_RUNNING_ON_PORT_8000'
                          ) + 1
                        );
                        return true;
                      },
                      () => {
                        setThinking(false);
                      },
                      2000,
                      15
                    );
                  }}
                >
                  Start
                </Button>
              </>
            )
          ) : (
            ''
          ))}
      </ButtonGroup>
    </Stack>
  );
}

function CheckForPlugins() {
  const { activeStep, setActiveStep } = useLocalConnectionContext();
  const [missingPlugins, setMissingPlugins] = useState([]);
  const [installing, setInstalling] = useState(false);

  useEffect(() => {
    if (activeStep !== Steps.indexOf('CHECK_FOR_IMPORTANT_PLUGINS')) return;

    (async () => {
      const p = await fetch(
        'http://localhost:8000/plugins/list_missing_plugins_for_current_platform'
      );
      const json = await p.json();
      setMissingPlugins(json);

      if (json.length === 0) {
        setActiveStep(Steps.indexOf('CHECK_FOR_IMPORTANT_PLUGINS') + 1);
      }
    })();
  }, [activeStep]);

  return (
    <>
      <Stack spacing={1}>
        {missingPlugins?.length == 0 ? (
          <Chip color="success">Success!</Chip>
        ) : (
          <></>
        )}

        <Typography level="body-sm">
          {window.platform.isMac() && window.platform.arch() == 'arm64' && (
            <>
              You are running on a <FaApple /> Mac with <b>Apple Silicon</b>
              .&nbsp;
            </>
          )}
          {missingPlugins?.length > 0 &&
            'The following platform-specific plugins are not yet installed:'}
        </Typography>
        <Typography level="body-sm" color="warning">
          {missingPlugins?.map((p) => p).join(', ')}
        </Typography>

        {activeStep == Steps.indexOf('CHECK_FOR_IMPORTANT_PLUGINS') && (
          <ButtonGroup variant="plain" spacing={1}>
            <Button
              variant="solid"
              color="primary"
              onClick={async () => {
                setInstalling(true);
                await fetch(
                  'http://localhost:8000/plugins/install_missing_plugins_for_current_platform'
                );
                setInstalling(false);
                setMissingPlugins([]);
                setActiveStep(Steps.indexOf('CHECK_FOR_IMPORTANT_PLUGINS') + 1);
                // setIntervalXTimes(
                //   async () => {
                //     const p = await fetch(
                //       'http://localhost:8000/plugins/list_missing_plugins_for_current_platform'
                //     );
                //     const json = await p.json();
                //     if (json.length === 0) {
                //       setMissingPlugins([]);
                //       setActiveStep(5);
                //       return true;
                //     }
                //     return false;
                //   },
                //   () => {},
                //   2000,
                //   12
                // );
              }}
              size="sm"
              disabled={installing}
              startDecorator={
                installing && <CircularProgress size="sm" color="primary" />
              }
            >
              Install{installing && 'ing'} Plugins
            </Button>
            {!installing && (
              <Button
                variant="plain"
                onClick={() => {
                  setActiveStep(
                    Steps.indexOf('CHECK_FOR_IMPORTANT_PLUGINS') + 1
                  );
                }}
                size="sm"
              >
                Skip
              </Button>
            )}
          </ButtonGroup>
        )}
      </Stack>
    </>
  );
}

function CheckIfCondaInstalled() {
  const { activeStep, setActiveStep } = useLocalConnectionContext();
  const [installStatus, setInstallStatus] = useState(''); // notstarted, pending, success, error

  useEffect(() => {
    if (activeStep !== Steps.indexOf('CHECK_IF_CONDA_INSTALLED')) return;

    (async () => {
      const condaExists = await window.electron.ipcRenderer.invoke(
        'server:checkIfCondaExists'
      );
      if (condaExists) {
        setInstallStatus('success');
        setActiveStep(Steps.indexOf('CHECK_IF_CONDA_INSTALLED') + 1);
      } else {
        setInstallStatus('notstarted');
      }
    })();
  }, [activeStep]);

  return (
    <>
      <Stack spacing={1}>
        {installStatus == 'success' && <Chip color="success">Success!</Chip>}
        {installStatus == 'pending' && (
          <>
            <CircularProgress color="primary" /> Installing. This can take a
            while.
          </>
        )}

        {activeStep == Steps.indexOf('CHECK_IF_CONDA_INSTALLED') &&
          installStatus == 'notstarted' && (
            <ButtonGroup variant="plain" spacing={1}>
              <Button
                variant="solid"
                size="sm"
                startDecorator={<RotateCcwIcon size="16px" />}
                onClick={async () => {
                  setInstallStatus('pending');
                  const installConda = await window.electron.ipcRenderer.invoke(
                    'server:install_conda'
                  );
                  const condaExists = await window.electron.ipcRenderer.invoke(
                    'server:checkIfCondaExists'
                  );
                  if (condaExists) {
                    setInstallStatus('success');
                    setActiveStep(
                      Steps.indexOf('CHECK_IF_CONDA_INSTALLED') + 1
                    );
                    return;
                  }
                  setIntervalXTimes(
                    async () => {
                      const condaExists =
                        await window.electron.ipcRenderer.invoke(
                          'server:checkIfCondaExists'
                        );
                      if (condaExists) {
                        setInstallStatus('success');
                        setActiveStep(
                          Steps.indexOf('CHECK_IF_CONDA_INSTALLED') + 1
                        );
                        return true;
                      }
                      return false;
                    },
                    () => {},
                    2000,
                    8
                  );
                }}
              >
                Install Conda
              </Button>
            </ButtonGroup>
          )}
      </Stack>
    </>
  );
}

function CheckIfCondaEnvironmentExists() {
  const { activeStep, setActiveStep } = useLocalConnectionContext();
  const [installStatus, setInstallStatus] = useState<
    'success' | 'notstarted' | 'pending' | 'error' | ''
  >(''); // notstarted, pending, success, error
  const [errorMessage, setErrorMessage] = useState<{
    message: string;
    data: any;
  } | null>(null);

  useEffect(() => {
    if (activeStep !== Steps.indexOf('CHECK_IF_CONDA_ENVIRONMENT_EXISTS'))
      return;

    (async () => {
      const condaExists = await window.electron.ipcRenderer.invoke(
        'server:checkIfCondaEnvironmentExists'
      );
      console.log(JSON.stringify(condaExists));
      if (condaExists?.status == 'success') {
        setInstallStatus('success');
        setActiveStep(Steps.indexOf('CHECK_IF_CONDA_ENVIRONMENT_EXISTS') + 1);
      } else {
        setInstallStatus('notstarted');
        setErrorMessage({
          message: condaExists?.message,
          data: condaExists?.data,
        });
      }
    })();
  }, [activeStep]);

  return (
    <>
      <Stack spacing={1}>
        {installStatus == 'success' && <Chip color="success">Success!</Chip>}
        {installStatus == 'pending' && (
          <>
            <CircularProgress color="primary" />
            <Typography level="body-sm" color="warning">
              Installing. This can take a while.
            </Typography>
          </>
        )}

        {activeStep == Steps.indexOf('CHECK_IF_CONDA_ENVIRONMENT_EXISTS') &&
          installStatus == 'notstarted' && (
            <ButtonGroup variant="plain" spacing={1}>
              <Button
                variant="solid"
                size="sm"
                startDecorator={<RotateCcwIcon size="16px" />}
                onClick={async () => {
                  setInstallStatus('pending');
                  const installConda = await window.electron.ipcRenderer.invoke(
                    'server:install_create-conda-environment'
                  );
                  const condaExists = await window.electron.ipcRenderer.invoke(
                    'server:checkIfCondaEnvironmentExists'
                  );
                  if (condaExists?.status == 'success') {
                    setInstallStatus('success');
                    setActiveStep(
                      Steps.indexOf('CHECK_IF_CONDA_ENVIRONMENT_EXISTS') + 1
                    );
                    return;
                  } else {
                    setInstallStatus('error');
                    setErrorMessage({
                      message: condaExists?.message,
                      data: condaExists?.data,
                    });
                  }
                  setIntervalXTimes(
                    async () => {
                      const condaExists =
                        await window.electron.ipcRenderer.invoke(
                          'server:checkIfCondaEnvironmentExists'
                        );
                      if (condaExists?.status == 'success') {
                        setInstallStatus('success');
                        setActiveStep(
                          Steps.indexOf('CHECK_IF_CONDA_ENVIRONMENT_EXISTS') + 1
                        );
                        return true;
                      } else {
                        setInstallStatus('error');
                        setErrorMessage({
                          message: condaExists?.message,
                          data: condaExists?.data,
                        });
                      }
                      return false;
                    },
                    () => {},
                    2000,
                    8
                  );
                }}
              >
                Create "transformerlab" Conda Environment
              </Button>
            </ButtonGroup>
          )}
        <Typography level="body-sm" color="warning">
          {errorMessage?.message}
        </Typography>
        <Typography level="body-sm" color="neutral">
          {errorMessage?.data?.stdout} {errorMessage?.data?.stderr}
        </Typography>
      </Stack>
    </>
  );
}

function CheckDependencies() {
  const { activeStep, setActiveStep } = useLocalConnectionContext();
  const [installStatus, setInstallStatus] = useState(''); // notstarted, pending, success, error
  const [errorMessage, setErrorMessage] = useState<Message>(null);

  useEffect(() => {
    if (activeStep !== Steps.indexOf('CHECK_IF_PYTHON_DEPENDENCIES_INSTALLED'))
      return;

    (async () => {
      const ipcResponse = await window.electron.ipcRenderer.invoke(
        'server:checkDependencies'
      );

      if (ipcResponse?.status == 'success' && ipcResponse?.data?.length == 0) {
        setInstallStatus('success');
        setActiveStep(
          Steps.indexOf('CHECK_IF_PYTHON_DEPENDENCIES_INSTALLED') + 1
        );
      } else {
        setInstallStatus('notstarted');
      }

      if (ipcResponse?.status == 'error') {
        setErrorMessage({
          message: ipcResponse?.message,
          data: ipcResponse?.data,
        });
      } else {
        setErrorMessage(null);
      }
    })();
  }, [activeStep]);

  return (
    <Stack spacing={1}>
      {installStatus == 'success' && <Chip color="success">Success!</Chip>}
      {installStatus == 'pending' && (
        <>
          <CircularProgress color="primary" />
          <Typography level="body-sm" color="warning">
            Installing. This can take a long while.
          </Typography>
        </>
      )}
      {activeStep == Steps.indexOf('CHECK_IF_PYTHON_DEPENDENCIES_INSTALLED') &&
        installStatus == 'notstarted' && (
          <ButtonGroup variant="plain" spacing={1}>
            <Button
              variant="solid"
              size="sm"
              startDecorator={<RotateCcwIcon size="16px" />}
              onClick={async () => {
                setInstallStatus('pending');
                setErrorMessage(null);
                await window.electron.ipcRenderer.invoke(
                  'server:install_install-dependencies'
                );

                const ipcResponse = await window.electron.ipcRenderer.invoke(
                  'server:checkDependencies'
                );

                if (
                  ipcResponse?.status == 'success' &&
                  ipcResponse?.data?.length == 0
                ) {
                  setInstallStatus('success');
                  setActiveStep(
                    Steps.indexOf('CHECK_IF_PYTHON_DEPENDENCIES_INSTALLED') + 1
                  );
                  return;
                }

                if (ipcResponse?.status == 'error') {
                  setErrorMessage({
                    message: ipcResponse?.message,
                    data: ipcResponse?.data,
                  });
                } else {
                  setErrorMessage(null);
                }
              }}
            >
              Install Dependencies
            </Button>
          </ButtonGroup>
        )}

      <Typography level="body-sm" color="warning">
        {errorMessage?.message}
      </Typography>
      <Typography level="body-sm" color="neutral">
        {errorMessage?.data?.stdout} {errorMessage?.data?.stderr}
      </Typography>
    </Stack>
  );
}

interface InstallStepProps {
  children: React.ReactNode;
  title: string;
  thisStep: number;
}

function InstallStep({ children, thisStep, title }: InstallStepProps) {
  const { activeStep, setActiveStep } = useLocalConnectionContext();
  return (
    <Step
      indicator={
        <StepIndicator
          variant={activeStep == thisStep ? 'solid' : 'soft'}
          color={activeStep > thisStep ? 'success' : 'primary'}
        >
          {activeStep > thisStep ? <CheckCircle2 /> : thisStep}
        </StepIndicator>
      }
    >
      <Sheet variant="outlined" sx={{ p: 1 }}>
        <Typography level="title-sm">{title}</Typography>
        {children}
      </Sheet>
    </Step>
  );
}

interface InstallStepperProps {
  setServer: (server: string) => void;
}

function InstallStepper({ setServer }: InstallStepperProps) {
  const [activeStep, setActiveStep] = useState(
    Steps.indexOf('CHECK_IF_INSTALLED')
  );

  function tryToConnect() {
    const fullServer = 'http://' + 'localhost' + ':' + '8000' + '/';
    window.TransformerLab = {
      API_URL: fullServer,
    };

    setActiveStep(Steps.indexOf('CHECK_IF_INSTALLED'));
    setServer(fullServer);
  }

  return (
    <LocalConnectionProvider>
      <Sheet
        sx={{
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          height: '100%',
        }}
      >
        <Stepper
          orientation="vertical"
          sx={{ display: 'flex', overflow: 'auto' }}
        >
          {/* Active Step: {activeStep} */}
          <InstallStep
            thisStep={Steps.indexOf('CHECK_IF_INSTALLED')}
            title="Check if Server is Installed at ~/.transformerlab/"
          >
            <CheckIfInstalled />
          </InstallStep>
          <InstallStep
            thisStep={Steps.indexOf('CHECK_VERSION')}
            title="Check Current Version"
          >
            <CheckCurrentVersion />
          </InstallStep>
          <InstallStep
            thisStep={Steps.indexOf('CHECK_IF_CONDA_INSTALLED')}
            title="Check if Conda is Installed at ~/.transformerlab/miniconda3/"
          >
            <CheckIfCondaInstalled />
          </InstallStep>
          <InstallStep
            thisStep={Steps.indexOf('CHECK_IF_CONDA_ENVIRONMENT_EXISTS')}
            title="Check if Conda Environment 'transformerlab' Exists"
          >
            <CheckIfCondaEnvironmentExists />
          </InstallStep>
          <InstallStep
            thisStep={Steps.indexOf('CHECK_IF_PYTHON_DEPENDENCIES_INSTALLED')}
            title="Check if Python Dependencies are Installed"
          >
            <CheckDependencies />
          </InstallStep>
          <InstallStep
            thisStep={Steps.indexOf('CHECK_IF_SERVER_RUNNING_ON_PORT_8000')}
            title="Check if Server is Running Locally on Port 8000"
          >
            <RunServer />
          </InstallStep>
          <InstallStep
            thisStep={Steps.indexOf('CHECK_FOR_IMPORTANT_PLUGINS')}
            title="Check for Important Plugins"
          >
            <CheckForPlugins />
          </InstallStep>
        </Stepper>

        <Button
          size="lg"
          variant="solid"
          color="success"
          onClick={tryToConnect}
          startDecorator={<PlayIcon />}
          sx={{ width: '100%', mt: 2, flex: 1, display: 'flex' }}
          disabled={activeStep !== Steps.length}
        >
          Connect
        </Button>
      </Sheet>
    </LocalConnectionProvider>
  );
}

export default InstallStepper;
