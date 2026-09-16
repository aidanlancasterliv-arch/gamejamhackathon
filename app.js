// Logic/Middleware layer

function randomBrightColor() {
  const hue = Math.floor(Math.random() * 360);
  return `hsl(${hue}, 90%, 55%)`;
}

function setRandomColor() {
  document.body.style.backgroundColor = randomBrightColor();
}

document.getElementById('change-btn').addEventListener('click', setRandomColor);

setRandomColor();
