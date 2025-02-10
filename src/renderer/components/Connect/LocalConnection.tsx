import {
  Alert,
  Button,
  CircularProgress,
  Modal,
  Sheet,
  Snackbar,
  Step,
  StepIndicator,
  Stepper,
  Tooltip,
  Typography,
} from '@mui/joy';
import { CheckCircle2, InfoIcon, TimerIcon } from 'lucide-react';
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
    console.log(`Testing if ${checkName} ${x + 1} of ${repetitions} times`);
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
  'CHECK_IF_INSTALLED', //0
  'CHECK_VERSION', //1
  'CHECK_IF_CONDA_INSTALLED', //2
  'CHECK_IF_CONDA_ENVIRONMENT_EXISTS', //3
  'CHECK_IF_PYTHON_DEPENDENCIES_INSTALLED', //4
  'CHECK_IF_SERVER_RUNNING_ON_PORT_8338', //5
  'CHECK_FOR_IMPORTANT_PLUGINS', //6
];

function logStep(step) {
  console.log('useEffect Active Step: ' + step + ': ' + Steps[step]);
}

function InstallStep({ children = <></>, thisStep, title, activeStep }) {
  return (
    <Step
      indicator={
        <StepIndicator
          variant={activeStep == thisStep ? 'solid' : 'soft'}
          color={activeStep > thisStep ? 'success' : 'primary'}
          className={activeStep == thisStep ? 'active-step' : ''}
        >
          {activeStep > thisStep ? <CheckCircle2 /> : thisStep + 1}
        </StepIndicator>
      }
    >
      <Sheet variant="outlined" sx={{ p: 1, mr: 1, borderRadius: '5px' }}>
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

  const [userRequestedInstall, setUserRequestedInstall] = useState(false);

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

  const [checkIfServerRunning, setCheckIfServerRunning] = useState(0);

  const [thinking, setThinking] = useState(false);
  const {
    server,
    error: serverError,
    mutate: mutateLocalConnectionCheck,
  } = useCheckLocalConnection();

  // This useEffect will be triggered on every server update -- we use this to check
  // if the server is running on port 8338 and if so, display the Connect button
  useEffect(() => {
    if (activeStep !== Steps.indexOf('CHECK_IF_SERVER_RUNNING_ON_PORT_8338'))
      return;

    logStep(activeStep);

    if (server && !serverError) {
      console.log('The server is up; I think things are good');
      setActiveStep(Steps.indexOf('CHECK_IF_SERVER_RUNNING_ON_PORT_8338') + 1);
      setThinking(false);
      return;
    } else {
      console.log('we are on step 6 and the server is not up');
      if (userRequestedInstall) {
        stepsFunctions[Steps.indexOf('CHECK_IF_SERVER_RUNNING_ON_PORT_8338')]();
      }
    }
  }, [server, activeStep, userRequestedInstall]);

  // Step 1 - Check if installed
  useEffect(() => {
    if (activeStep !== Steps.indexOf('CHECK_IF_INSTALLED')) return;
    if (!userRequestedInstall) return;

    logStep(activeStep);

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
            if (userRequestedInstall) {
              stepsFunctions[Steps.indexOf('CHECK_IF_INSTALLED')]();
            }
          }
          return;
        })
        .catch((error) => {
          setInstallStatus('error');
          setInstallErrorMessage(error.message);
        });
    })();
  }, [activeStep, userRequestedInstall]);

  // Step 2 - Check Current Version
  useEffect(() => {
    if (activeStep !== Steps.indexOf('CHECK_VERSION')) return;
    if (!userRequestedInstall) return;

    logStep(activeStep);
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
        json.tag_name =
          'Unable to Connect to Github -- Skipping API version check';
        // just skip this step if we can't connect
        setActiveStep(Steps.indexOf('CHECK_VERSION') + 1);
      }
      const tag = json.tag_name;

      setRelease(tag);

      if (ver === tag) {
        setActiveStep(Steps.indexOf('CHECK_VERSION') + 1);
      } else {
        if (userRequestedInstall) {
          stepsFunctions[Steps.indexOf('CHECK_VERSION')]();
        }
      }
    })();
  }, [activeStep, userRequestedInstall]);

  // Step 3 - Check if Conda is Installed
  useEffect(() => {
    if (activeStep !== Steps.indexOf('CHECK_IF_CONDA_INSTALLED')) return;
    if (!userRequestedInstall) return;

    logStep(activeStep);

    (async () => {
      const condaExists = await window.electron.ipcRenderer.invoke(
        'server:checkIfCondaExists'
      );
      if (condaExists) {
        setInstallStatus('success');
        setActiveStep(Steps.indexOf('CHECK_IF_CONDA_INSTALLED') + 1);
      } else {
        setInstallStatus('notstarted');
        if (userRequestedInstall) {
          stepsFunctions[Steps.indexOf('CHECK_IF_CONDA_INSTALLED')]();
        }
      }
    })();
  }, [activeStep, userRequestedInstall]);

  // Step 4 - Check if Conda Environment Exists
  useEffect(() => {
    if (activeStep !== Steps.indexOf('CHECK_IF_CONDA_ENVIRONMENT_EXISTS'))
      return;
    if (!userRequestedInstall) return;

    logStep(activeStep);

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
        setErrorMessage(condaExists?.message);
        if (userRequestedInstall) {
          stepsFunctions[Steps.indexOf('CHECK_IF_CONDA_ENVIRONMENT_EXISTS')]();
        }
      }
    })();
  }, [activeStep, userRequestedInstall]);

  // Step 5 - Check if Python Dependencies are Installed
  useEffect(() => {
    if (activeStep !== Steps.indexOf('CHECK_IF_PYTHON_DEPENDENCIES_INSTALLED'))
      return;
    if (!userRequestedInstall) return;

    logStep(activeStep);

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
        if (userRequestedInstall) {
          stepsFunctions[
            Steps.indexOf('CHECK_IF_PYTHON_DEPENDENCIES_INSTALLED')
          ]();
        }
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
  }, [activeStep, userRequestedInstall]);

  // Step 7 - Check for Important Plugins
  useEffect(() => {
    if (activeStep !== Steps.indexOf('CHECK_FOR_IMPORTANT_PLUGINS')) return;
    if (!userRequestedInstall) return;

    logStep(activeStep);

    (async () => {
      const p = await fetch(
        'http://localhost:8338/plugins/list_missing_plugins_for_current_platform'
      );
      const json = await p.json();
      setMissingPlugins(json);

      if (json.length === 0) {
        setActiveStep(Steps.indexOf('CHECK_FOR_IMPORTANT_PLUGINS') + 1);
        stepsFunctions[Steps.indexOf('CHECK_FOR_IMPORTANT_PLUGINS') + 1](); // This connects and closes the window
      } else {
        if (userRequestedInstall) {
          stepsFunctions[Steps.indexOf('CHECK_FOR_IMPORTANT_PLUGINS')]();
          stepsFunctions[Steps.indexOf('CHECK_FOR_IMPORTANT_PLUGINS') + 1](); // This connects and closes the window
        }
      }
    })();
  }, [activeStep, userRequestedInstall]);

  function tryToConnect() {
    const fullServer = 'http://' + 'localhost' + ':' + '8338' + '/';
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
      setActiveStep(Steps.indexOf('CHECK_IF_SERVER_RUNNING_ON_PORT_8338') + 1);
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

    setCheckIfServerRunning(checkIfServerRunning + 1);
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
        setErrorMessage('Failed to download Transformer Lab');
        setInstallStatus('error');
        setThinking(false);
        setUserRequestedInstall(false);
        setActiveStep(Steps.indexOf('CHECK_IF_INSTALLED'));

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
        const releaseValue = tag;

        console.log('version: ', ver);
        console.log('release: ', releaseValue);
        if (ver === releaseValue) {
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
      alert(
        'Conda could not be installed. Try running "~/.transformerlab/src/install.sh install_conda" in your terminal. This can sometimes be caused by a file permission error where the ~/.conda directory on your machine is not accessible to your user account.'
      );
      setThinking(false);
      setActiveStep(Steps.indexOf('CHECK_IF_INSTALLED'));
      setUserRequestedInstall(false);
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
      setErrorMessage(condaExists?.message);
      setThinking(false);
      setUserRequestedInstall(false);
      // Not sure if this is the right thign to do or not?
      // Pro: If you try to install again it will start at beginning.
      // Con: You can't see visually where the install failed.
      // Sticking with previous behaviour.
      setActiveStep(Steps.indexOf('CHECK_IF_INSTALLED'));
    }
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
      'http://localhost:8338/plugins/install_missing_plugins_for_current_platform'
    );
    setInstallingPlugins(false);
    setMissingPlugins([]);
    setActiveStep(Steps.indexOf('CHECK_FOR_IMPORTANT_PLUGINS') + 1);
  }

  var stepsFunctions: (() => Promise<void>)[] = [];

  stepsFunctions[Steps.indexOf('CHECK_IF_INSTALLED')] = async () => {
    await installAPI();
    setThinking(false);
  };
  stepsFunctions[Steps.indexOf('CHECK_VERSION')] = async () => {
    await checkCurrentVersion();
    setThinking(false);
  };
  stepsFunctions[Steps.indexOf('CHECK_IF_CONDA_INSTALLED')] = async () => {
    await checkIfCondaIsInstalled();
    setThinking(false);
  };
  stepsFunctions[Steps.indexOf('CHECK_IF_CONDA_ENVIRONMENT_EXISTS')] =
    async () => {
      await checkIfCondaEnvironmentExists();
      setThinking(false);
    };
  stepsFunctions[Steps.indexOf('CHECK_IF_PYTHON_DEPENDENCIES_INSTALLED')] =
    async () => {
      await installDependencies();
      setThinking(false);
    };
  stepsFunctions[Steps.indexOf('CHECK_IF_SERVER_RUNNING_ON_PORT_8338')] =
    async () => {
      await runServer();
      // don't run set thinking -- server needs to be polled
    };
  stepsFunctions[Steps.indexOf('CHECK_FOR_IMPORTANT_PLUGINS')] = async () => {
    console.log(Steps.indexOf('CHECK_FOR_IMPORTANT_PLUGINS'));
    await checkForPlugins();
    setThinking(false);
  };
  // The following is the a fake step: we are done so we just connect
  stepsFunctions[7] = async () => {
    console.log('entering step 7');
    tryToConnect();
  };

  const logTriggerStrings = ['Uvicorn running on'];
  const logTriggerFunction = (data) => {
    console.log('Log Trigger String Happened: ' + data);
    if (data.includes('Uvicorn running on')) {
      // call with a 150ms delay just to give the server some time to start up
      setTimeout(() => {
        mutateLocalConnectionCheck();
      }, 150);
    }
  };
  // This function is called if specific strings in the Log are sent

  const [elapsedTime, setElapsedTime] = useState(0);
  const [intervalId, setIntervalId] = useState(null);
  const [dismissItsTakingAWhileModal, setDismissItsTakingAWhileModal] =
    useState(false);

  useEffect(() => {
    let id;
    if (userRequestedInstall) {
      setDismissItsTakingAWhileModal(false);
      id = setInterval(() => {
        setElapsedTime((prevTime) => prevTime + 1);
      }, 1000);
      setIntervalId(id);
    } else {
      clearInterval(intervalId);
      setElapsedTime(0);
    }

    return () => clearInterval(id);
  }, [userRequestedInstall]);

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
      {elapsedTime > 15 && !dismissItsTakingAWhileModal && (
        <Alert
          sx={{
            background: 'var(--joy-palette-primary-100)',
            color: 'var(--joy-palette-primary-800)',
            opacity: 0.9,
            position: 'absolute',
            float: 'left',
            left: '50%',
            top: '50%',
            transform: 'translate(-50%, -50%)',
            zIndex: 1000,
            flexDirection: 'column',
          }}
          startDecorator={<TimerIcon />}
        >
          <Typography level="body-sm">
            The initial setup process may take a few minutes as it sets up a
            Python ML workspace on your computer. Subsequent connections will be
            much faster.
            {elapsedTime > 25 && (
              <>
                <br />
                <br />
                If it appears like nothing is happening for a while, check the
                terminal for any potential errors. You can safely close the the
                application and start it again if things appear stuck for more
                than a couple minutes.
                <br />
                <br />
                One place where the Python conda installer pauses is when you
                see "more hidden" on the bottom of the screen. This can take a
                few minutes.
                <br />
                <br />
                The other part that takes a while is when you see "Installing
                collected packages"
                <br />
                <br />
                <Button
                  size="sm"
                  variant="outlined"
                  onClick={() => setDismissItsTakingAWhileModal(true)}
                >
                  Dismiss
                </Button>
              </>
            )}
          </Typography>
        </Alert>
      )}
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
            {/* Active step:{' '}
            {activeStep} */}
          </Typography>
        </Alert>
        {installStatus === 'error' && (
          <Alert variant="outlined" color="danger" sx={{ my: 2 }}>
            {installErrorMessage} {errorMessage?.message}{' '}
            {JSON.stringify(errorMessage?.data)} {errorMessage} {release}
          </Alert>
        )}
        <div style={{ flex: 1, overflow: 'auto' }}>
          <Stepper orientation="vertical" sx={{}}>
            {/* Active Step: {activeStep} */}
            <InstallStep
              thisStep={Steps.indexOf('CHECK_IF_INSTALLED')}
              title="Check if Server is Installed at ~/.transformerlab/"
              activeStep={activeStep}
            ></InstallStep>
            <InstallStep
              thisStep={Steps.indexOf('CHECK_VERSION')}
              title="Check Current Version"
              activeStep={activeStep}
            ></InstallStep>
            <InstallStep
              thisStep={Steps.indexOf('CHECK_IF_CONDA_INSTALLED')}
              title={
                <>
                  Check if Conda is Installed at ~/.transformerlab/miniconda3/{' '}
                </>
              }
              activeStep={activeStep}
            ></InstallStep>
            <InstallStep
              thisStep={Steps.indexOf('CHECK_IF_CONDA_ENVIRONMENT_EXISTS')}
              title="Check if Conda Environment 'transformerlab' Exists"
              activeStep={activeStep}
            ></InstallStep>
            <InstallStep
              thisStep={Steps.indexOf('CHECK_IF_PYTHON_DEPENDENCIES_INSTALLED')}
              title="Check if Python Dependencies are Installed"
              activeStep={activeStep}
            ></InstallStep>
            <InstallStep
              thisStep={Steps.indexOf('CHECK_IF_SERVER_RUNNING_ON_PORT_8338')}
              title="Check if the Transformer Lab Engine is Running Locally on Port 8338"
              activeStep={activeStep}
            ></InstallStep>
            <InstallStep
              thisStep={Steps.indexOf('CHECK_FOR_IMPORTANT_PLUGINS')}
              title="Check for Important Plugins"
              activeStep={activeStep}
            ></InstallStep>
          </Stepper>
        </div>
        <Button
          size="lg"
          variant="solid"
          color="success"
          disabled={thinking || userRequestedInstall}
          onClick={() => {
            setUserRequestedInstall(true);
          }}
        >
          {(thinking || userRequestedInstall) && (
            <CircularProgress sx={{ marginRight: 1 }} />
          )}
          {userRequestedInstall ? 'Connecting...' : 'Connect'}
          {userRequestedInstall && (
            <span style={{ marginLeft: '10px' }}>{elapsedTime}s</span>
          )}
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
            height: '100%',
          }}
        >
          <LogViewer
            triggerStrings={logTriggerStrings}
            triggerFunction={logTriggerFunction}
          />
        </Sheet>
      )}
    </Sheet>
  );
}

function LocalConnection({ setServer }) {
  return <InstallStepper setServer={setServer} />;
}

export default LocalConnection;
