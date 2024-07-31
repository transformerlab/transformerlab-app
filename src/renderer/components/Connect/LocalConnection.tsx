import {
  Alert,
  Button,
  ButtonGroup,
  Chip,
  CircularProgress,
  Sheet,
  Stack,
  Step,
  StepIndicator,
  Stepper,
  Tooltip,
  Typography,
} from '@mui/joy';
import { CheckCircle2, InfoIcon, PlayIcon, RotateCcwIcon } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useCheckLocalConnection } from 'renderer/lib/transformerlab-api-sdk';

import { FaApple } from 'react-icons/fa6';
import LargeTooltip from './LargeTooltip';

// Runs a callback every delay milliseconds, up to repetitions times.
// If the callback returns true, the interval is cleared.
// If the callback returns false, and the interval has run repetitions times, the notSuccessful callback is run.
function setIntervalXTimes(
  checkName,
  callback,
  notSuccessful,
  delay,
  repetitions
) {
  var x = 0;
  var intervalID = window.setInterval(async function () {
    console.log(`Testing if ${checkName} ${x} times`);
    const response = await callback();

    if (response) {
      window.clearInterval(intervalID);
    } else if (++x === repetitions) {
      notSuccessful();
      window.clearInterval(intervalID);
    }
  }, delay);
}

const Steps = [
  'CHECK_IF_INSTALLED',
  'CHECK_VERSION',
  'CHECK_IF_CONDA_INSTALLED',
  'CHECK_IF_CONDA_ENVIRONMENT_EXISTS',
  'CHECK_IF_PYTHON_DEPENDENCIES_INSTALLED',
  'CHECK_IF_SERVER_RUNNING_ON_PORT_8000',
  'CHECK_FOR_IMPORTANT_PLUGINS',
];

function CheckIfInstalled({ activeStep, setActiveStep }) {
  const [installStatus, setInstallStatus] = useState('notstarted'); // notstarted, pending, success, error
  const [installErrorMessage, setInstallErrorMessage] = useState(null);

  useEffect(() => {
    if (activeStep !== Steps.indexOf('CHECK_IF_INSTALLED')) return;
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
                    'API is Installed',
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

function CheckCurrentVersion({ activeStep, setActiveStep }) {
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

      let json = {};

      try {
        const rel = await fetch(
          'https://api.github.com/repos/transformerlab/transformerlab-api/releases/latest'
        );
        json = await rel.json();
      } catch {
        json.tag_name = 'Unable to Connect to Github Please Skip';
      }
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
                  'Server Version is Updated',
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

function RunServer({ activeStep, setActiveStep }) {
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
        'Server is Running on Port 8000',
        async () => {
          if (!server || serverError) return false;
          setActiveStep(
            Steps.indexOf('CHECK_IF_SERVER_RUNNING_ON_PORT_8000') + 1
          );
          return true;
        },
        () => {
          console.log('failed to detect server running (priliminary)');
        },
        2000,
        10
      );
    }
  }, [activeStep, server]);

  return (
    <>
      <Stack spacing={1}>
        {activeStep >= Steps.indexOf('CHECK_IF_SERVER_RUNNING_ON_PORT_8000') &&
          server &&
          !serverError && <Chip color="success">Success!</Chip>}
        {activeStep >= Steps.indexOf('CHECK_IF_SERVER_RUNNING_ON_PORT_8000') &&
          (!server || serverError) && <Chip color="danger">Not Running</Chip>}
        <ButtonGroup variant="plain" spacing={1}>
          {activeStep ==
            Steps.indexOf('CHECK_IF_SERVER_RUNNING_ON_PORT_8000') &&
            (!server || serverError ? (
              thinking ? (
                <CircularProgress color="primary" />
              ) : (
                <>
                  <Button
                    variant="solid"
                    onClick={async () => {
                      console.log('Start Server Clicked');
                      setThinking(true);

                      // before starting the process, check one more time if it is running
                      if (server && !serverError) {
                        setThinking(false);
                        setActiveStep(
                          Steps.indexOf(
                            'CHECK_IF_SERVER_RUNNING_ON_PORT_8000'
                          ) + 1
                        );
                        return;
                      }

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
                      // set interval to check if server is running every 2 seconds, 15 times:
                      setIntervalXTimes(
                        'Server is Running on Port 8000',
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
                          console.log(
                            'failed to detect server running (after running)'
                          );
                          setThinking(false);
                        },
                        1000,
                        25
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
    </>
  );
}

function CheckForPlugins({ activeStep, setActiveStep }) {
  const [missingPlugins, setMissingPlugins] = useState(null);
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
          {platform.isMac() && platform.arch() == 'arm64' && (
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

function CheckIfCondaInstalled({ activeStep, setActiveStep }) {
  const [installStatus, setInstallStatus] = useState(''); // notstarted, pending, success, error
  const [errorMessage, setErrorMessage] = useState(null);
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
            <Typography level="body-sm" color="neutral">
              <CircularProgress color="primary" />
              <br />
              Installing. This can take a while.
            </Typography>
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
                  if (installConda?.error) {
                    setInstallStatus('error');
                    setErrorMessage(installConda?.stderr);
                  }
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
                    'Conda is Installed',
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
                    () => {
                      setInstallStatus('error');
                    },
                    2000,
                    8
                  );
                }}
              >
                Install Conda
              </Button>
            </ButtonGroup>
          )}
        <Typography level="body-sm" color="warning">
          {errorMessage && (
            <>
              Transformer Lab encountered the following unexpected Error:
              <pre style={{ whiteSpace: 'pre-wrap' }}>{errorMessage}</pre>
              Please try to fix the above issue and restart the app.
            </>
          )}
        </Typography>
      </Stack>
    </>
  );
}

function CheckIfCondaEnvironmentExists({ activeStep, setActiveStep }) {
  const [installStatus, setInstallStatus] = useState(''); // notstarted, pending, success, error
  const [errorMessage, setErrorMessage] = useState(null);

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
                    'Conda Environment Exists',
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

function CheckDependencies({ activeStep, setActiveStep }) {
  const [installStatus, setInstallStatus] = useState(''); // notstarted, pending, success, error
  const [errorMessage, setErrorMessage] = useState(null);

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
    <>
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
        {activeStep ==
          Steps.indexOf('CHECK_IF_PYTHON_DEPENDENCIES_INSTALLED') &&
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
                      Steps.indexOf('CHECK_IF_PYTHON_DEPENDENCIES_INSTALLED') +
                        1
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
    </>
  );
}

function InstallStep({ children, thisStep, title, activeStep, setActiveStep }) {
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
        <Typography level="title-sm">
          {title}{' '}
          <Tooltip
            title={<LargeTooltip stepNumber={thisStep} />}
            placement="bottom-start"
            variant="outlined"
          >
            <InfoIcon size="18px" />
          </Tooltip>
        </Typography>
        {children}
      </Sheet>
    </Step>
  );
}

function InstallStepper({ setServer }) {
  const [activeStep, setActiveStep] = useState(
    Steps.indexOf('CHECK_IF_INSTALLED')
  ); // 0, 1, 2

  function tryToConnect() {
    const fullServer = 'http://' + 'localhost' + ':' + '8000' + '/';
    window.TransformerLab = {};
    window.TransformerLab.API_URL = fullServer;
    setActiveStep(Steps.indexOf('CHECK_IF_INSTALLED'));
    setServer(fullServer);
  }

  return (
    <Sheet
      sx={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        overflow: 'hidden',
      }}
    >
      <Alert variant="plain">
        <Typography
          level="body-sm"
          mt={1}
          mb={2}
          textColor="text.tertiary"
          fontWeight={400}
        >
          This panel starts up and connects to the Transformer Lab Engine on
          your local machine. If you have access to a separate computer with a
          powerful GPU, use "Connect to Remote Engine" instead.
        </Typography>
      </Alert>
      <div style={{ flex: 1, overflow: 'auto' }}>
        <Stepper orientation="vertical" sx={{}}>
          {/* Active Step: {activeStep} */}
          <InstallStep
            thisStep={Steps.indexOf('CHECK_IF_INSTALLED')}
            title="Check if Server is Installed at ~/.transformerlab/"
            activeStep={activeStep}
            setActiveStep={setActiveStep}
          >
            <CheckIfInstalled
              activeStep={activeStep}
              setActiveStep={setActiveStep}
            />
          </InstallStep>
          <InstallStep
            thisStep={Steps.indexOf('CHECK_VERSION')}
            title="Check Current Version"
            activeStep={activeStep}
            setActiveStep={setActiveStep}
          >
            <CheckCurrentVersion
              activeStep={activeStep}
              setActiveStep={setActiveStep}
            />
          </InstallStep>
          <InstallStep
            thisStep={Steps.indexOf('CHECK_IF_CONDA_INSTALLED')}
            title={
              <>Check if Conda is Installed at ~/.transformerlab/miniconda3/ </>
            }
            activeStep={activeStep}
            setActiveStep={setActiveStep}
          >
            <CheckIfCondaInstalled
              activeStep={activeStep}
              setActiveStep={setActiveStep}
            />
          </InstallStep>
          <InstallStep
            thisStep={Steps.indexOf('CHECK_IF_CONDA_ENVIRONMENT_EXISTS')}
            title="Check if Conda Environment 'transformerlab' Exists"
            activeStep={activeStep}
            setActiveStep={setActiveStep}
          >
            <CheckIfCondaEnvironmentExists
              activeStep={activeStep}
              setActiveStep={setActiveStep}
            />
          </InstallStep>
          <InstallStep
            thisStep={Steps.indexOf('CHECK_IF_PYTHON_DEPENDENCIES_INSTALLED')}
            title="Check if Python Dependencies are Installed"
            activeStep={activeStep}
            setActiveStep={setActiveStep}
          >
            <CheckDependencies
              activeStep={activeStep}
              setActiveStep={setActiveStep}
            />
          </InstallStep>
          <InstallStep
            thisStep={Steps.indexOf('CHECK_IF_SERVER_RUNNING_ON_PORT_8000')}
            title="Check if the Transformer Lab Engine is Running Locally on Port 8000"
            activeStep={activeStep}
            setActiveStep={setActiveStep}
          >
            <RunServer activeStep={activeStep} setActiveStep={setActiveStep} />
          </InstallStep>
          <InstallStep
            thisStep={Steps.indexOf('CHECK_FOR_IMPORTANT_PLUGINS')}
            title="Check for Important Plugins"
            activeStep={activeStep}
            setActiveStep={setActiveStep}
          >
            <CheckForPlugins
              activeStep={activeStep}
              setActiveStep={setActiveStep}
            />
          </InstallStep>
        </Stepper>
      </div>
      <Button
        size="lg"
        variant="solid"
        color="success"
        onClick={tryToConnect}
        startDecorator={<PlayIcon />}
        sx={{ width: '100%', mt: 2 }}
        disabled={activeStep !== Steps.length}
      >
        Connect
      </Button>
    </Sheet>
  );
}

function LocalConnection({ setServer }) {
  return <InstallStepper setServer={setServer} />;
}

export default LocalConnection;
