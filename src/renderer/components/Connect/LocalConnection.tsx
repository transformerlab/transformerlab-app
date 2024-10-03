import {
  Alert,
  Button,
  Sheet,
  Step,
  StepIndicator,
  Stepper,
  Tooltip,
  Typography,
} from '@mui/joy';
import { CheckCircle2, InfoIcon } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useCheckLocalConnection } from 'renderer/lib/transformerlab-api-sdk';

import LargeTooltip from './LargeTooltip';
import LogViewer from './LogViewer';

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
    console.log(`Testing if ${checkName} ${x} of ${repetitions} times`);
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

function CheckIfInstalled({
  activeStep,
  setActiveStep,
  installStatus,
  setInstallStatus,
  installErrorMessage,
  installAPI,
}) {
  return <></>;
}

function CheckCurrentVersion({
  activeStep,
  setActiveStep,
  version,
  setVersion,
  release,
  setRelease,
  checkCurrentVersion,
}) {
  return <></>;
}

function RunServer({ activeStep, setActiveStep, runServer, thinking }) {
  return <></>;
}

function CheckForPlugins({
  activeStep,
  setActiveStep,
  missingPlugins,
  setMissingPlugins,
  installing,
  setInstalling,
  checkForPlugins,
}) {
  return <></>;
}

function CheckIfCondaInstalled({
  activeStep,
  setActiveStep,
  installStatus,
  errorMessage,
  checkIfCondaIsInstalled,
}) {
  return <></>;
}

function CheckIfCondaEnvironmentExists({
  activeStep,
  setActiveStep,
  installStatus,
  errorMessage,
  checkIfCondaEnvironmentExists,
}) {
  return <></>;
}

function CheckDependencies({
  activeStep,
  setActiveStep,
  errorMessage,
  setErrorMessage,
  installDependencies,
}) {
  const [installStatus, setInstallStatus] = useState(''); // notstarted, pending, success, error

  return <></>;
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
        <Typography level="title-sm" mb={1}>
          {title}{' '}
          <Tooltip
            title={<LargeTooltip stepNumber={thisStep} />}
            placement="bottom-start"
            variant="outlined"
          >
            <InfoIcon size="14px" color="var(--joy-palette-neutral-400)" />
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

  const [installStatus, setInstallStatus] = useState('notstarted'); // notstarted, pending, success, error
  const [installErrorMessage, setInstallErrorMessage] = useState(null);

  const [version, setVersion] = useState('pending'); // pending, or #.#.#
  const [release, setRelease] = useState('');

  const [logViewerVisible, setLogViewerVisible] = useState(true);
  const [errorMessage, setErrorMessage] = useState(null);
  const [dependenciesErrorMessage, setDependenciesErrorMessage] =
    useState(null);

  const [missingPlugins, setMissingPlugins] = useState(null);
  const [installingPlugins, setInstallingPlugins] = useState(false);

  const [thinking, setThinking] = useState(false);
  const {
    server,
    isLoading: serverIsLoading,
    error: serverError,
  } = useCheckLocalConnection();

  useEffect(() => {
    if (activeStep !== Steps.indexOf('CHECK_IF_SERVER_RUNNING_ON_PORT_8000'))
      return;

    console.log('useEffect Active Step: ' + activeStep);

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

  useEffect(() => {
    if (activeStep !== Steps.indexOf('CHECK_IF_INSTALLED')) return;

    console.log('useEffect Active Step: ' + activeStep);

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

  useEffect(() => {
    if (activeStep !== Steps.indexOf('CHECK_VERSION')) return;

    console.log('useEffect Active Step: ' + activeStep);

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

  useEffect(() => {
    if (activeStep !== Steps.indexOf('CHECK_IF_CONDA_INSTALLED')) return;

    console.log('useEffect Active Step: ' + activeStep);

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

  useEffect(() => {
    if (activeStep !== Steps.indexOf('CHECK_IF_CONDA_ENVIRONMENT_EXISTS'))
      return;

    console.log('useEffect Active Step: ' + activeStep);

    (async () => {
      setInstallStatus('pending');
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

  useEffect(() => {
    if (activeStep !== Steps.indexOf('CHECK_IF_PYTHON_DEPENDENCIES_INSTALLED'))
      return;

    console.log('useEffect Active Step: ' + activeStep);

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
        console.log('error');
        setDependenciesErrorMessage({
          message: ipcResponse?.message,
          data: ipcResponse?.data,
        });
      } else {
        setDependenciesErrorMessage(null);
      }
    })();
  }, [activeStep]);

  useEffect(() => {
    if (activeStep !== Steps.indexOf('CHECK_FOR_IMPORTANT_PLUGINS')) return;

    console.log('useEffect Active Step: ' + activeStep);

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

  function tryToConnect() {
    const fullServer = 'http://' + 'localhost' + ':' + '8000' + '/';
    window.TransformerLab = {};
    window.TransformerLab.API_URL = fullServer;
    setActiveStep(Steps.indexOf('CHECK_IF_INSTALLED'));
    setServer(fullServer);
  }

  async function runServer() {
    console.log('Start Server Clicked');
    setThinking(true);

    // before starting the process, check one more time if it is running
    if (server && !serverError) {
      setThinking(false);
      setActiveStep(Steps.indexOf('CHECK_IF_SERVER_RUNNING_ON_PORT_8000') + 1);
      return;
    }

    console.log('Starting Server');
    const start_process = await window.electron.ipcRenderer.invoke(
      'server:startLocalServer'
    );

    if (start_process?.status == 'error') {
      const response_text =
        'Failed to start server: \n' + start_process?.message;
      alert(response_text);
      setThinking(false);
      return;
    }

    console.log('Server has started');
    console.log(
      'Start checking if the server is running every 1 seconds, 25 times'
    );
    // set interval to check if server is running every 1 seconds, 25 times:
    setIntervalXTimes(
      'Server is Running on Port 8000',
      async () => {
        if (!server || serverError) return false;
        setThinking(false);
        setActiveStep(
          Steps.indexOf('CHECK_IF_SERVER_RUNNING_ON_PORT_8000') + 1
        );
        return true;
      },
      () => {
        console.log('failed to detect server running (after running)');
        setThinking(false);
      },
      1000,
      25
    );
  }

  async function installAPI() {
    await window.electron.ipcRenderer.invoke('server:InstallLocally');
    setInstallStatus('pending');
    setIntervalXTimes(
      'API is Installed',
      async () => {
        const serverIsInstalled = await window.electron.ipcRenderer.invoke(
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
  }

  async function checkCurrentVersion() {
    await window.electron.ipcRenderer.invoke('server:InstallLocally');
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
  }

  async function checkIfCondaIsInstalled() {
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
      setActiveStep(Steps.indexOf('CHECK_IF_CONDA_INSTALLED') + 1);
      return;
    }
    setIntervalXTimes(
      'Conda is Installed',
      async () => {
        const condaExists = await window.electron.ipcRenderer.invoke(
          'server:checkIfCondaExists'
        );
        if (condaExists) {
          setInstallStatus('success');
          setActiveStep(Steps.indexOf('CHECK_IF_CONDA_INSTALLED') + 1);
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
  }

  async function checkIfCondaEnvironmentExists() {
    setInstallStatus('pending');
    const installConda = await window.electron.ipcRenderer.invoke(
      'server:install_create-conda-environment'
    );
    const condaExists = await window.electron.ipcRenderer.invoke(
      'server:checkIfCondaEnvironmentExists'
    );
    if (condaExists?.status == 'success') {
      setInstallStatus('success');
      setActiveStep(Steps.indexOf('CHECK_IF_CONDA_ENVIRONMENT_EXISTS') + 1);
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
        const condaExists = await window.electron.ipcRenderer.invoke(
          'server:checkIfCondaEnvironmentExists'
        );
        if (condaExists?.status == 'success') {
          setInstallStatus('success');
          setActiveStep(Steps.indexOf('CHECK_IF_CONDA_ENVIRONMENT_EXISTS') + 1);
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
  }

  async function installDependencies() {
    setInstallStatus('pending');
    setDependenciesErrorMessage(null);
    await window.electron.ipcRenderer.invoke(
      'server:install_install-dependencies'
    );

    const ipcResponse = await window.electron.ipcRenderer.invoke(
      'server:checkDependencies'
    );

    if (ipcResponse?.status == 'success' && ipcResponse?.data?.length == 0) {
      setInstallStatus('success');
      setActiveStep(
        Steps.indexOf('CHECK_IF_PYTHON_DEPENDENCIES_INSTALLED') + 1
      );
      return;
    }

    if (ipcResponse?.status == 'error') {
      setDependenciesErrorMessage({
        message: ipcResponse?.message,
        data: ipcResponse?.data,
      });
    } else {
      setDependenciesErrorMessage(null);
    }
  }

  async function checkForPlugins() {
    setInstallingPlugins(true);
    await fetch(
      'http://localhost:8000/plugins/install_missing_plugins_for_current_platform'
    );
    setInstallingPlugins(false);
    setMissingPlugins([]);
    setActiveStep(Steps.indexOf('CHECK_FOR_IMPORTANT_PLUGINS') + 1);
  }

  var stepsFunctions: (() => Promise<void>)[] = [];

  /*  'CHECK_IF_INSTALLED',
  'CHECK_VERSION',
  'CHECK_IF_CONDA_INSTALLED',
  'CHECK_IF_CONDA_ENVIRONMENT_EXISTS',
  'CHECK_IF_PYTHON_DEPENDENCIES_INSTALLED',
  'CHECK_IF_SERVER_RUNNING_ON_PORT_8000',
  'CHECK_FOR_IMPORTANT_PLUGINS',*/

  stepsFunctions[Steps.indexOf('CHECK_IF_INSTALLED')] = async () => {
    await installAPI();
  };
  stepsFunctions[Steps.indexOf('CHECK_VERSION')] = async () => {
    await checkCurrentVersion();
  };
  stepsFunctions[Steps.indexOf('CHECK_IF_CONDA_INSTALLED')] = async () => {
    await checkIfCondaIsInstalled();
  };
  stepsFunctions[Steps.indexOf('CHECK_IF_CONDA_ENVIRONMENT_EXISTS')] =
    async () => {
      await checkIfCondaEnvironmentExists();
    };
  stepsFunctions[Steps.indexOf('CHECK_IF_PYTHON_DEPENDENCIES_INSTALLED')] =
    async () => {
      await installDependencies();
    };
  stepsFunctions[Steps.indexOf('CHECK_IF_SERVER_RUNNING_ON_PORT_8000')] =
    runServer;
  stepsFunctions[Steps.indexOf('CHECK_FOR_IMPORTANT_PLUGINS')] = async () => {
    await checkForPlugins();
  };
  // The following is the a fake step: we are done so we just connect
  stepsFunctions[7] = async () => {
    tryToConnect();
  };

  return (
    <Sheet
      sx={{
        display: 'flex',
        flexDirection: 'row',
        overflow: 'hidden',
        height: '100%',
        gap: 1,
      }}
    >
      <Sheet
        sx={{
          display: 'flex',
          flexDirection: 'column',
          height: '100%',
          overflow: 'hidden',
          flex: '1',
          minWidth: 300,
        }}
      >
        <Alert variant="plain">
          <Typography
            level="body-sm"
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
                installStatus={installStatus}
                setInstallStatus={setInstallStatus}
                installErrorMessage={installErrorMessage}
                installAPI={installAPI}
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
                version={version}
                setVersion={setVersion}
                release={release}
                setRelease={setRelease}
                checkCurrentVersion={checkCurrentVersion}
              />
            </InstallStep>
            <InstallStep
              thisStep={Steps.indexOf('CHECK_IF_CONDA_INSTALLED')}
              title={
                <>
                  Check if Conda is Installed at ~/.transformerlab/miniconda3/{' '}
                </>
              }
              activeStep={activeStep}
              setActiveStep={setActiveStep}
            >
              <CheckIfCondaInstalled
                activeStep={activeStep}
                setActiveStep={setActiveStep}
                checkIfCondaIsInstalled={checkIfCondaIsInstalled}
                installStatus={installStatus}
                errorMessage={errorMessage}
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
                installStatus={installStatus}
                errorMessage={errorMessage}
                checkIfCondaEnvironmentExists={checkIfCondaEnvironmentExists}
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
                errorMessage={dependenciesErrorMessage}
                setErrorMessage={setDependenciesErrorMessage}
                installDependencies={installDependencies}
              />
            </InstallStep>
            <InstallStep
              thisStep={Steps.indexOf('CHECK_IF_SERVER_RUNNING_ON_PORT_8000')}
              title="Check if the Transformer Lab Engine is Running Locally on Port 8000"
              activeStep={activeStep}
              setActiveStep={setActiveStep}
            >
              <RunServer
                activeStep={activeStep}
                setActiveStep={setActiveStep}
                runServer={runServer}
                thinking={thinking}
              />
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
                missingPlugins={missingPlugins}
                setMissingPlugins={setMissingPlugins}
                installing={installingPlugins}
                setInstalling={setInstallingPlugins}
                checkForPlugins={checkForPlugins}
              />
            </InstallStep>
          </Stepper>
        </div>
        {/* <Button
          size="lg"
          variant="solid"
          color="success"
          onClick={tryToConnect}
          startDecorator={<PlayIcon />}
          sx={{ width: '100%', mt: 1 }}
          disabled={activeStep !== Steps.length}
        >
          Connect
        </Button> */}
        <Button
          size="lg"
          variant="solid"
          color="success"
          disabled={thinking}
          onClick={async () => {
            setThinking(true);
            await stepsFunctions[activeStep]();
            setThinking(false);
          }}
        >
          {activeStep === 7 ? 'Connect' : 'Run Next Install Step'}
        </Button>
      </Sheet>

      {logViewerVisible && (
        <Sheet
          sx={{
            flex: 2,
            backgroundColor: '#222',
            fontFamily: 'monospace',
            p: 3,
            borderRadius: 10,
          }}
        >
          <LogViewer />
        </Sheet>
      )}
    </Sheet>
  );
}

function LocalConnection({ setServer }) {
  return <InstallStepper setServer={setServer} />;
}

export default LocalConnection;
