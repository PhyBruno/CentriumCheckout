/**
 * @schema 2.11
 * @input modules: number = 25
 * @input color: color = #0A0B0D
 * @input background: color = #FFFFFF
 */
const modules = Math.max(15, Math.floor(pencil.input.modules));
const cell = pencil.width / modules;
const nodes = [];

nodes.push({ type: "rectangle", name: "QR fundo", x: 0, y: 0, width: pencil.width, height: pencil.height, fill: pencil.input.background });

const zones = [[0, 0], [0, modules - 7], [modules - 7, 0]];

function finderValue(r, c, zr, zc) {
  const lr = r - zr, lc = c - zc;
  if (lr === 0 || lr === 6 || lc === 0 || lc === 6) return true;
  if (lr >= 2 && lr <= 4 && lc >= 2 && lc <= 4) return true;
  return false;
}

let seed = 1337;
function rand() {
  seed = (seed * 1103515245 + 12345) & 0x7fffffff;
  return seed / 0x7fffffff;
}

for (let r = 0; r < modules; r++) {
  for (let c = 0; c < modules; c++) {
    const zone = zones.find(([zr, zc]) => r >= zr && r < zr + 7 && c >= zc && c < zc + 7);
    let dark;
    if (zone) {
      dark = finderValue(r, c, zone[0], zone[1]);
    } else if (r < 8 && c < 8) {
      dark = false;
    } else if (r < 8 && c >= modules - 8) {
      dark = false;
    } else if (r >= modules - 8 && c < 8) {
      dark = false;
    } else {
      dark = rand() > 0.55;
    }
    if (dark) {
      nodes.push({ type: "rectangle", name: "m", x: c * cell, y: r * cell, width: cell, height: cell, fill: pencil.input.color });
    }
  }
}

return nodes;
