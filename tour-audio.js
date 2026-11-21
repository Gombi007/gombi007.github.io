const musicVolume = 0.21;
const firstStepDistance = 0.28;
const stepResetDelay = 0.24;
const stepSlot = 0.30;
const stepDuration = 0.225;
const stepOrder = [0, 3, 1, 4, 2, 5];

async function loadBuffer(context, path) {
  const response = await fetch(new URL(path, import.meta.url));
  if (!response.ok) throw new Error(`Could not load ${path}.`);
  return context.decodeAudioData(await response.arrayBuffer());
}

export function createTourAudio(stepLength) {
  const AudioContextClass = globalThis.AudioContext ?? globalThis.webkitAudioContext;
  let context;
  let musicGain;
  let stepGain;
  let stepBuffer;
  let stepSource;
  let playing = false;
  let musicEnabled = true;
  let distanceToStep = firstStepDistance;
  let idleTime = 0;
  let nextStep = 0;

  function initialize() {
    context = new AudioContextClass();
    musicGain = context.createGain();
    musicGain.gain.value = musicEnabled ? musicVolume : 0;
    musicGain.connect(context.destination);
    stepGain = context.createGain();
    stepGain.gain.value = 0.33;
    stepGain.connect(context.destination);

    loadBuffer(context, './assets/room-tour.mp3').then((buffer) => {
      const source = context.createBufferSource();
      source.buffer = buffer;
      source.loop = true;
      source.connect(musicGain);
      source.start();
    }).catch((error) => console.warn('Room tour music:', error));
    loadBuffer(context, './assets/laminate-steps.wav?v=2').then((buffer) => {
      stepBuffer = buffer;
    }).catch((error) => console.warn('Room tour footsteps:', error));
  }

  function setPlaying(active) {
    playing = active;
    distanceToStep = firstStepDistance;
    idleTime = 0;
    if (active && AudioContextClass) {
      try {
        if (!context) initialize();
        context.resume().catch((error) => console.warn('Could not start room audio:', error));
      } catch (error) {
        console.warn('Could not initialize room audio:', error);
      }
    } else if (context) {
      stepSource?.stop();
      stepSource = undefined;
      context.suspend().catch((error) => console.warn('Could not pause room audio:', error));
    }
  }

  function toggleMusic() {
    musicEnabled = !musicEnabled;
    if (musicGain) {
      const now = context.currentTime;
      musicGain.gain.setTargetAtTime(musicEnabled ? musicVolume : 0, now, 0.025);
    }
    return musicEnabled;
  }

  function advance(distance, delta) {
    if (!playing) return;
    if (distance <= 0) {
      idleTime += delta;
      if (idleTime >= stepResetDelay) distanceToStep = firstStepDistance;
      return;
    }
    idleTime = 0;
    if (!stepBuffer || context.state !== 'running') return;
    distanceToStep -= distance;
    if (distanceToStep > 0) return;
    distanceToStep += stepLength;

    const source = context.createBufferSource();
    source.buffer = stepBuffer;
    source.connect(stepGain);
    source.onended = () => {
      source.disconnect();
      if (stepSource === source) stepSource = undefined;
    };
    stepSource = source;
    source.start(0, stepOrder[nextStep] * stepSlot, stepDuration);
    nextStep = (nextStep + 1) % stepOrder.length;
  }

  return { supported: Boolean(AudioContextClass), setPlaying, toggleMusic, advance };
}
