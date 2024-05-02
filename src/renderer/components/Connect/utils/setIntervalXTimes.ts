// Runs a callback every delay milliseconds, up to repetitions times.
// If the callback returns true, the interval is cleared.
// If the callback returns false, and the interval has run repetitions times, the notSuccessful callback is run.
export function setIntervalXTimes(
  callback: () => any,
  notSuccessful: () => void,
  delay: number,
  repetitions: number
) {
  let x = 0;
  const intervalID = window.setInterval(async function () {
    console.log(`trying ${x} times`);
    const response = await callback();

    if (response) {
      window.clearInterval(intervalID);
    } else if (++x === repetitions) {
      notSuccessful();
      window.clearInterval(intervalID);
    }
  }, delay);

  return intervalID;
}
