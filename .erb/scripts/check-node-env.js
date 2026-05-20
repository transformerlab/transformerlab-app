export default function checkNodeEnv(expectedEnv) {
  if (!expectedEnv) {
    throw new Error('"expectedEnv" not set');
  }

  if (process.env.NODE_ENV !== expectedEnv) {
    console.log(
      `\x1b[1m\x1b[97m\x1b[41m"process.env.NODE_ENV" must be "${expectedEnv}" to use this webpack config\x1b[0m`,
    );
    process.exit(2);
  }
}
