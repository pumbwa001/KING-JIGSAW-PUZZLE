const STORAGE_KEY = "jigsaw-picture-progress";
const LEGACY_STORAGE_KEY = "jigsaw-picture-level-one";
const UNLOCKED_LEVEL_KEY = "jigsaw-picture-unlocked-through";
const UNLOCKED_LEVELS_KEY = "jigsaw-picture-unlocks";
const PICTURES = {
  lake: {
    name: "Mountain lake",
    src: "assets/jigsaw-picture.png",
    alt: "Sunset over a mountain lake",
  },
  leopard: {
    name: "Leopard at sunset",
    src: "assets/leopard-picture.png",
    alt: "A leopard resting in a tree above the savannah at sunset",
  },
  eagle: {
    name: "Bald eagle by the lake",
    src: "assets/eagle-picture.png",
    alt: "A bald eagle perched by a lake at sunset",
  },
  flamingo: {
    name: "Flamingos at sunset",
    src: "assets/flamingo-picture.png",
    alt: "Flamingos gathered in a lake beneath sunset mountains",
  },
};
const LEVELS = [
  { count: 5, columns: 5, name: "Level One" },
  { count: 10, columns: 5, name: "Level Two" },
  { count: 20, columns: 5, name: "Level Three" },
  { count: 40, columns: 8, name: "Level Four" },
  { count: 36, columns: 6, name: "Hard Level One" },
  { count: 64, columns: 8, name: "Hard Level Two" },
  { count: 100, columns: 10, name: "Hard Level Three" },
];

const welcomeScreen = document.querySelector("#welcome-screen");
const gameScreen = document.querySelector("#game-screen");
const homeMenu = document.querySelector("#home-menu");
const picturePicker = document.querySelector("#picture-picker");
const levelPickerScreen = document.querySelector("#level-picker-screen");
const continueButton = document.querySelector("#continue-button");
const puzzleBoard = document.querySelector("#puzzle-board");
const movesCount = document.querySelector("#moves-count");
const gameMessage = document.querySelector("#game-message");
const winOverlay = document.querySelector("#win-overlay");
const gameLevel = document.querySelector("#game-level");
const previewImage = document.querySelector("#preview-image");
const pianoButton = document.querySelector("#piano-button");

let unlockedLevels = loadUnlockedLevels();
let savedGame = loadSavedGame();
let selectedPictureId = "lake";
let selectedPiece = null;
let clueSource = null;
let clueTarget = null;
let clueCursor = 0;
let pianoEnabled = true;
let pianoContext = null;
let pianoTimer = null;
let pianoPauseTimer = null;
let pianoNoteIndex = 0;
let pianoMaster = null;
let pianoDelay = null;
let pianoDelayReturn = null;
let pianoWave = null;

function getLevel(count) {
  return LEVELS.find((level) => level.count === count);
}

function getLevelIndex(count) {
  return LEVELS.findIndex((level) => level.count === count);
}

function isLevelUnlocked(pictureId, count) {
  return getLevelIndex(count) <= getLevelIndex(unlockedLevels[pictureId]);
}

function loadUnlockedLevels() {
  const stored = localStorage.getItem(UNLOCKED_LEVELS_KEY);
  if (stored) {
    try {
      const progress = JSON.parse(stored);
      return Object.fromEntries(Object.keys(PICTURES).map((pictureId) => {
        const count = progress[pictureId];
        return [pictureId, getLevel(count) ? count : LEVELS[0].count];
      }));
    } catch (error) {
      console.error("Could not read saved level progress.", error);
    }
  }

  const legacyCount = Number(localStorage.getItem(UNLOCKED_LEVEL_KEY));
  return Object.fromEntries(Object.keys(PICTURES).map((pictureId) => [
    pictureId,
    pictureId === "lake" && getLevel(legacyCount) ? legacyCount : LEVELS[0].count,
  ]));
}

function isValidGame(value) {
  return value
    && Object.hasOwn(PICTURES, value.pictureId)
    && getLevel(value.count)
    && isLevelUnlocked(value.pictureId, value.count)
    && Array.isArray(value.positions)
    && value.positions.length === value.count
    && value.positions.every((position) => Number.isInteger(position) && position >= 0 && position < value.count)
    && Array.isArray(value.order)
    && value.order.length === value.count
    && value.order.every((piece) => Number.isInteger(piece) && piece >= 0 && piece < value.count)
    && new Set(value.order).size === value.count
    && Number.isInteger(value.moves)
    && value.moves >= 0
    && value.complete === false;
}

function loadSavedGame() {
  const stored = localStorage.getItem(STORAGE_KEY) || localStorage.getItem(LEGACY_STORAGE_KEY);
  if (!stored) return null;

  try {
    const game = JSON.parse(stored);
    if (!game.pictureId) game.pictureId = "lake";
    if (game.count === undefined && Array.isArray(game.pieces)) {
      game.count = game.pieces.length;
    }
    if (!Array.isArray(game.positions) && Array.isArray(game.pieces)) {
      game.positions = Array(game.count);
      game.pieces.forEach((piece, position) => {
        game.positions[piece] = position;
      });
      game.order = Array.from({ length: game.count }, (_, piece) => piece);
    }
    if (isValidGame(game)) {
      if (normalizePiecePositions(game)) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(game));
        localStorage.removeItem(LEGACY_STORAGE_KEY);
      }
      return game;
    }
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(LEGACY_STORAGE_KEY);
    return null;
  } catch (error) {
    console.error("Could not read the saved puzzle.", error);
    return null;
  }
}

function normalizePiecePositions(game) {
  const occupied = new Set();
  let changed = false;
  for (let piece = 0; piece < game.count; piece += 1) {
    const position = game.positions[piece];
    if (occupied.has(position)) {
      let emptyPosition = 0;
      while (occupied.has(emptyPosition)) emptyPosition += 1;
      game.positions[piece] = emptyPosition;
      occupied.add(emptyPosition);
      changed = true;
    } else {
      occupied.add(position);
    }
  }
  return changed;
}

function saveGame() {
  if (savedGame.complete) {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(LEGACY_STORAGE_KEY);
  } else {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(savedGame));
    localStorage.removeItem(LEGACY_STORAGE_KEY);
  }
  continueButton.hidden = !savedGame || savedGame.complete;
}

function shuffledPieces(count) {
  const pieces = Array.from({ length: count }, (_, index) => index);
  for (let index = pieces.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [pieces[index], pieces[swapIndex]] = [pieces[swapIndex], pieces[index]];
  }
  if (pieces.every((piece, index) => piece === index)) {
    [pieces[0], pieces[1]] = [pieces[1], pieces[0]];
  }
  return pieces;
}

function startNewGame(count) {
  const pictureId = selectedPictureId;
  if (!getLevel(count) || !isLevelUnlocked(pictureId, count)) return;
  const pieces = shuffledPieces(count);
  const positions = Array(count);
  pieces.forEach((piece, position) => {
    positions[piece] = position;
  });
  savedGame = {
    pictureId,
    count,
    positions,
    order: Array.from({ length: count }, (_, piece) => piece),
    moves: 0,
    complete: false,
  };
  selectedPiece = null;
  clueSource = null;
  clueTarget = null;
  clueCursor = 0;
  saveGame();
  showGame();
}

function showGame() {
  const level = getLevel(savedGame.count);
  const picture = PICTURES[savedGame.pictureId];
  selectedPictureId = savedGame.pictureId;
  welcomeScreen.hidden = true;
  gameScreen.hidden = false;
  winOverlay.hidden = true;
  selectedPiece = null;
  clueSource = null;
  clueTarget = null;
  gameLevel.textContent = `${level.name.toUpperCase()} · ${level.count} PIECES`;
  previewImage.src = picture.src;
  previewImage.alt = `Completed picture: ${picture.alt}`;
  renderBoard();
  gameMessage.textContent = "Choose a piece, then choose where it belongs.";
  if (pianoEnabled) startPiano();
}

function showHome() {
  stopPiano();
  pianoButton.textContent = pianoEnabled ? "♫ Piano: On" : "♫ Piano: Off";
  pianoButton.setAttribute("aria-pressed", String(pianoEnabled));
  gameScreen.hidden = true;
  welcomeScreen.hidden = false;
  homeMenu.hidden = false;
  picturePicker.hidden = true;
  levelPickerScreen.hidden = true;
  continueButton.hidden = !savedGame || savedGame.complete;
  updateLevelButtons();
  updatePictureProgress();
}

function initializePiano() {
  const AudioContextConstructor = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextConstructor) {
    throw new Error("This browser does not support audio playback.");
  }

  pianoContext = new AudioContextConstructor();
  pianoMaster = pianoContext.createGain();
  pianoMaster.gain.value = 0.22;

  pianoDelay = pianoContext.createDelay(1);
  pianoDelay.delayTime.value = 0.34;
  const feedback = pianoContext.createGain();
  feedback.gain.value = 0.16;
  pianoDelayReturn = pianoContext.createGain();
  pianoDelayReturn.gain.value = 0.18;

  pianoDelay.connect(pianoDelayReturn);
  pianoDelayReturn.connect(pianoMaster);
  pianoDelay.connect(feedback);
  feedback.connect(pianoDelay);
  pianoMaster.connect(pianoContext.destination);

  const real = new Float32Array([0, 1, 0.48, 0.24, 0.13, 0.075, 0.045, 0.025, 0.012]);
  const imaginary = new Float32Array(real.length);
  pianoWave = pianoContext.createPeriodicWave(real, imaginary);
}

function playPianoNote(frequency) {
  const startTime = pianoContext.currentTime;
  const oscillator = pianoContext.createOscillator();
  const envelope = pianoContext.createGain();
  oscillator.setPeriodicWave(pianoWave);
  oscillator.frequency.value = frequency;
  envelope.gain.setValueAtTime(0.0001, startTime);
  envelope.gain.exponentialRampToValueAtTime(0.035, startTime + 0.018);
  envelope.gain.exponentialRampToValueAtTime(0.0001, startTime + 2.8);
  oscillator.connect(envelope);
  envelope.connect(pianoMaster);
  envelope.connect(pianoDelay);
  oscillator.start(startTime);
  oscillator.stop(startTime + 2.85);
}

async function playMoveSound() {
  try {
    if (!pianoContext) initializePiano();
    await pianoContext.resume();

    const startTime = pianoContext.currentTime;
    for (const [frequency, offset] of [[660, 0], [880, 0.055]]) {
      const oscillator = pianoContext.createOscillator();
      const envelope = pianoContext.createGain();
      oscillator.type = "sine";
      oscillator.frequency.value = frequency;
      envelope.gain.setValueAtTime(0.0001, startTime + offset);
      envelope.gain.exponentialRampToValueAtTime(0.12, startTime + offset + 0.012);
      envelope.gain.exponentialRampToValueAtTime(0.0001, startTime + offset + 0.24);
      oscillator.connect(envelope);
      envelope.connect(pianoContext.destination);
      oscillator.start(startTime + offset);
      oscillator.stop(startTime + offset + 0.25);
    }
  } catch (error) {
    console.error("Could not play the piece-placement sound.", error);
  }
}

async function startPiano() {
  try {
    if (!pianoContext) initializePiano();
    if (pianoPauseTimer !== null) {
      clearTimeout(pianoPauseTimer);
      pianoPauseTimer = null;
    }
    await pianoContext.resume();
    if (!pianoEnabled || gameScreen.hidden || savedGame.complete) return;

    if (pianoTimer !== null) clearInterval(pianoTimer);
    const melody = [261.63, 329.63, 392, 440, 392, 329.63, 293.66, 392];
    pianoNoteIndex = 0;
    playPianoNote(melody[pianoNoteIndex]);
    pianoNoteIndex += 1;
    pianoTimer = setInterval(() => {
      if (pianoContext.state === "running" && !gameScreen.hidden && !savedGame.complete) {
        playPianoNote(melody[pianoNoteIndex % melody.length]);
        pianoNoteIndex += 1;
      }
    }, 1100);
    pianoButton.textContent = "♫ Piano: On";
    pianoButton.setAttribute("aria-pressed", "true");
    gameMessage.textContent = "Soft piano is playing. Choose a piece to begin.";
  } catch (error) {
    pianoEnabled = false;
    pianoButton.textContent = "♫ Piano unavailable";
    pianoButton.setAttribute("aria-pressed", "false");
    pianoButton.disabled = true;
    gameMessage.textContent = "Piano ambience could not be started in this browser.";
    console.error("Could not start piano ambience.", error);
  }
}

function stopPiano(suspendDelay = 0) {
  if (pianoTimer !== null) {
    clearInterval(pianoTimer);
    pianoTimer = null;
  }
  if (pianoPauseTimer !== null) {
    clearTimeout(pianoPauseTimer);
    pianoPauseTimer = null;
  }
  if (!pianoContext || pianoContext.state !== "running") return;

  const suspend = () => {
    pianoPauseTimer = null;
    if (pianoContext.state === "running") {
      pianoContext.suspend().catch((error) => {
        console.error("Could not pause piano ambience.", error);
      });
    }
  };
  if (suspendDelay > 0) pianoPauseTimer = setTimeout(suspend, suspendDelay);
  else suspend();
}

function togglePiano() {
  pianoEnabled = !pianoEnabled;
  if (pianoEnabled) {
    startPiano();
  } else {
    stopPiano();
    pianoButton.textContent = "♫ Piano: Off";
    pianoButton.setAttribute("aria-pressed", "false");
    gameMessage.textContent = "Piano ambience is off.";
  }
}

function showPicturePicker() {
  homeMenu.hidden = true;
  picturePicker.hidden = false;
  levelPickerScreen.hidden = true;
  updatePictureProgress();
}

function showLevelPicker(pictureId) {
  if (!Object.hasOwn(PICTURES, pictureId)) return;
  selectedPictureId = pictureId;
  homeMenu.hidden = true;
  picturePicker.hidden = true;
  levelPickerScreen.hidden = false;
  document.querySelector("#selected-picture-name").textContent = PICTURES[pictureId].name;
  updateLevelButtons();
}

function updatePictureProgress() {
  document.querySelectorAll("[data-progress-for]").forEach((label) => {
    const count = unlockedLevels[label.dataset.progressFor];
    const level = getLevel(count) || LEVELS[0];
    label.textContent = `${level.name} unlocked`;
  });
}

function updateLevelButtons() {
  document.querySelectorAll(".level-button").forEach((button) => {
    const count = Number(button.dataset.count);
    const unlockedThrough = unlockedLevels[selectedPictureId];
    const locked = getLevelIndex(count) > getLevelIndex(unlockedThrough);
    button.disabled = locked;
    button.classList.toggle("is-locked", locked);
    button.classList.toggle("button-primary", count === unlockedThrough);
    button.classList.toggle("button-secondary", count !== unlockedThrough);
    button.querySelector(".lock-label").hidden = !locked;
  });
}

function renderBoard() {
  const level = getLevel(savedGame.count);
  const rows = savedGame.count / level.columns;
  puzzleBoard.style.setProperty("--columns", level.columns);
  puzzleBoard.style.setProperty("--rows", rows);
  puzzleBoard.setAttribute("aria-label", `${savedGame.count}-piece jigsaw puzzle board`);
  puzzleBoard.replaceChildren();
  movesCount.textContent = String(savedGame.moves);

  const targetMarker = clueTarget === null ? null : document.createElement("span");
  if (targetMarker) {
    targetMarker.className = "clue-target-marker";
    targetMarker.style.gridColumn = String((clueTarget % level.columns) + 1);
    targetMarker.style.gridRow = String(Math.floor(clueTarget / level.columns) + 1);
    targetMarker.setAttribute("aria-hidden", "true");
    puzzleBoard.append(targetMarker);
  }

  savedGame.order.forEach((piece) => {
    const position = savedGame.positions[piece];
    const button = document.createElement("button");
    const sourceRow = Math.floor(piece / level.columns);
    const sourceColumn = piece % level.columns;
    const boardRow = Math.floor(position / level.columns);
    const boardColumn = position % level.columns;
    button.className = "piece";
    button.type = "button";
    button.draggable = true;
    button.style.backgroundImage = `url("${PICTURES[savedGame.pictureId].src}")`;
    button.setAttribute("aria-label", `Picture piece${savedGame.positions[piece] === piece ? ", correct place" : ""}`);
    button.style.backgroundSize = `${level.columns * 100}% ${rows * 100}%`;
    button.style.backgroundPosition = `${level.columns === 1 ? 0 : (sourceColumn / (level.columns - 1)) * 100}% ${rows === 1 ? 0 : (sourceRow / (rows - 1)) * 100}%`;
    button.style.gridColumn = String(boardColumn + 1);
    button.style.gridRow = String(boardRow + 1);
    button.dataset.piece = String(piece);

    if (savedGame.positions[piece] === piece) button.classList.add("is-correct");
    if (selectedPiece === piece) button.classList.add("is-selected");
    if (clueSource === piece) button.classList.add("is-clue-piece");

    puzzleBoard.append(button);
  });
}

function getTargetPosition(event) {
  const bounds = puzzleBoard.getBoundingClientRect();
  const level = getLevel(savedGame.count);
  const rows = savedGame.count / level.columns;
  const cellWidth = puzzleBoard.clientWidth / level.columns;
  const cellHeight = puzzleBoard.clientHeight / rows;
  const column = Math.max(0, Math.min(level.columns - 1, Math.floor((event.clientX - bounds.left - puzzleBoard.clientLeft) / cellWidth)));
  const row = Math.max(0, Math.min(rows - 1, Math.floor((event.clientY - bounds.top - puzzleBoard.clientTop) / cellHeight)));
  return row * level.columns + column;
}

function clearClue() {
  clueSource = null;
  clueTarget = null;
}

function giveClue() {
  const misplacedPieces = savedGame.positions
    .map((position, piece) => position !== piece ? piece : -1)
    .filter((piece) => piece !== -1);

  if (misplacedPieces.length === 0) return;

  const source = misplacedPieces[clueCursor % misplacedPieces.length];
  const destination = source;
  clueCursor += 1;
  selectedPiece = null;
  clueSource = source;
  clueTarget = destination;
  gameMessage.textContent = "Move the gold-highlighted piece to the teal spot.";
  renderBoard();
}

function movePiece(piece, destinationPosition) {
  if (savedGame.positions[piece] === destinationPosition) {
    selectedPiece = null;
    clearClue();
    renderBoard();
    return;
  }

  const previousPosition = savedGame.positions[piece];
  const pieceAtDestination = savedGame.positions.findIndex(
    (position, otherPiece) => otherPiece !== piece && position === destinationPosition,
  );
  savedGame.positions[piece] = destinationPosition;
  if (pieceAtDestination !== -1) {
    savedGame.positions[pieceAtDestination] = previousPosition;
  }
  savedGame.order = savedGame.order.filter((orderedPiece) => orderedPiece !== piece);
  savedGame.order.push(piece);
  savedGame.moves += 1;
  playMoveSound();
  selectedPiece = null;
  clearClue();

  if (savedGame.positions.every((position, index) => position === index)) {
    savedGame.complete = true;
    const currentLevelIndex = LEVELS.findIndex((level) => level.count === savedGame.count);
    const nextLevel = LEVELS[currentLevelIndex + 1];
    if (nextLevel) {
      unlockedLevels[savedGame.pictureId] = nextLevel.count;
      localStorage.setItem(UNLOCKED_LEVELS_KEY, JSON.stringify(unlockedLevels));
      if (savedGame.pictureId === "lake") {
        localStorage.setItem(UNLOCKED_LEVEL_KEY, String(nextLevel.count));
      }
    }
    saveGame();
    updateLevelButtons();
    updatePictureProgress();
    renderBoard();
    document.querySelector("#win-message").textContent = `You put all ${savedGame.count} pieces back together!`;
    document.querySelector("#next-level-button").hidden = !nextLevel;
    winOverlay.hidden = false;
    stopPiano(350);
    return;
  }

  saveGame();
  renderBoard();
  gameMessage.textContent = "Nice move! Keep going.";
}

document.querySelector("#play-button").addEventListener("click", showPicturePicker);
document.querySelector("#pictures-home-button").addEventListener("click", () => {
  picturePicker.hidden = true;
  homeMenu.hidden = false;
});
document.querySelector("#levels-pictures-button").addEventListener("click", showPicturePicker);
document.querySelectorAll(".picture-option").forEach((button) => {
  button.addEventListener("click", () => showLevelPicker(button.dataset.picture));
});
document.querySelectorAll(".level-button").forEach((button) => {
  button.addEventListener("click", () => {
    if (!button.disabled) startNewGame(Number(button.dataset.count));
  });
});
document.querySelector("#hard-level-toggle").addEventListener("click", (event) => {
  const options = document.querySelector("#hard-level-options");
  const expanded = event.currentTarget.getAttribute("aria-expanded") === "true";
  event.currentTarget.setAttribute("aria-expanded", String(!expanded));
  options.hidden = expanded;
});
continueButton.addEventListener("click", () => {
  if (savedGame && !savedGame.complete) showGame();
});
document.querySelector("#home-button").addEventListener("click", showHome);
document.querySelector("#win-home-button").addEventListener("click", showHome);
document.querySelector("#restart-button").addEventListener("click", () => startNewGame(savedGame.count));
document.querySelector("#play-again-button").addEventListener("click", () => startNewGame(savedGame.count));
document.querySelector("#next-level-button").addEventListener("click", () => {
  const currentLevelIndex = LEVELS.findIndex((level) => level.count === savedGame.count);
  const nextLevel = LEVELS[currentLevelIndex + 1];
  selectedPictureId = savedGame.pictureId;
  if (savedGame.complete && nextLevel && isLevelUnlocked(savedGame.pictureId, nextLevel.count)) {
    startNewGame(nextLevel.count);
  }
});
document.querySelector("#clue-button").addEventListener("click", giveClue);
pianoButton.addEventListener("click", togglePiano);

puzzleBoard.addEventListener("click", (event) => {
  const piece = event.target.closest(".piece");
  if (selectedPiece !== null) {
    let destination;
    if (piece) {
      destination = savedGame.positions[Number(piece.dataset.piece)];
    } else {
      destination = getTargetPosition(event);
    }
    movePiece(selectedPiece, destination);
  } else if (piece) {
    clearClue();
    selectedPiece = Number(piece.dataset.piece);
    gameMessage.textContent = "Choose where this piece should go. Other pieces will stay put.";
    renderBoard();
  } else {
    return;
  }
});

puzzleBoard.addEventListener("dragstart", (event) => {
  const piece = event.target.closest(".piece");
  if (!piece) return;
  event.dataTransfer.effectAllowed = "move";
  event.dataTransfer.setData("text/plain", piece.dataset.piece);
});

puzzleBoard.addEventListener("dragover", (event) => {
  event.preventDefault();
  event.dataTransfer.dropEffect = "move";
  const piece = event.target.closest(".piece");
  if (piece) piece.classList.add("is-drag-target");
});

puzzleBoard.addEventListener("dragleave", (event) => {
  const piece = event.target.closest(".piece");
  if (piece) piece.classList.remove("is-drag-target");
});

puzzleBoard.addEventListener("drop", (event) => {
  const piece = event.target.closest(".piece");
  event.preventDefault();
  const source = Number(event.dataTransfer.getData("text/plain"));
  if (!Number.isInteger(source) || source < 0 || source >= savedGame.count) return;

  let destination;
  if (piece) {
    piece.classList.remove("is-drag-target");
    destination = savedGame.positions[Number(piece.dataset.piece)];
  } else {
    destination = getTargetPosition(event);
  }
  movePiece(source, destination);
});

puzzleBoard.addEventListener("dragend", () => {
  puzzleBoard.querySelectorAll(".is-drag-target").forEach((piece) => {
    piece.classList.remove("is-drag-target");
  });
});

continueButton.hidden = !savedGame;
updateLevelButtons();
