export default function convertTwitchDurationToSeconds(
  twitchDuration: string,
): number {
  const hourSplit = twitchDuration.split('h');
  let hours = 0;
  let minutes = 0;
  let seconds = 0;
  if (hourSplit.length > 1) {
    hours = parseInt(hourSplit[0], 10);
    twitchDuration = hourSplit[1];
  }
  const minuteSplit = twitchDuration.split('m');
  if (minuteSplit.length > 1) {
    minutes = parseInt(minuteSplit[0], 10);
    twitchDuration = minuteSplit[1];
  }
  const secondSplit = twitchDuration.split('s');
  if (secondSplit.length) {
    seconds = parseInt(secondSplit[0]);
  }
  return seconds + minutes * 60 + hours * 60 * 60;
}
