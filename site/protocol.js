export const PROTOCOL = 1;
export const BUTTON_COUNT = 4;
export const ALL_BUTTONS = (1 << BUTTON_COUNT) - 1;
export const ROOM_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export function newRoomCode(excluded = new Set()) {
  const size = ROOM_ALPHABET.length;
  const start = crypto.getRandomValues(new Uint16Array(1))[0] % (size * size);
  for (let offset = 0; offset < size * size; offset++) {
    const index = (start + offset) % (size * size);
    const code = ROOM_ALPHABET[Math.floor(index / size)] + ROOM_ALPHABET[index % size];
    if (!excluded.has(code)) return code;
  }
  throw new Error('No room codes are available. Please try again shortly.');
}
export function parseRoomCode(value) {
  let code = value.trim();
  if (/^https?:\/\//i.test(code)) {
    try { code = new URLSearchParams(new URL(code).hash.slice(1)).get('room') || ''; } catch { return null; }
  }
  code = code.toUpperCase().replace(/[\s-]/g, '');
  return code.length === 2 && [...code].every(c => ROOM_ALPHABET.includes(c)) ? code : null;
}
export function validInput(message) {
  return message?.type === 'input' && Number.isSafeInteger(message.seq) && message.seq >= 0 &&
    Number.isInteger(message.mask) && message.mask >= 0 && message.mask <= ALL_BUTTONS;
}

export function validAction(m){return m?.type==='action'&&Number.isSafeInteger(m.seq)&&m.seq>=0&&(m.action==='stop'||(m.action==='move'&&Number.isInteger(m.x)&&m.x>=0&&m.x<128&&Number.isInteger(m.y)&&m.y>=0&&m.y<64&&Number.isInteger(m.layer)&&m.layer>=1&&m.layer<=3));}
export function validView(m){return m?.type==='view'&&m.view&&Number.isInteger(m.view.x)&&Number.isInteger(m.view.y)&&Number.isInteger(m.view.layer)&&m.view.x>=0&&m.view.x<128&&m.view.y>=0&&m.view.y<64&&m.view.layer>=1&&m.view.layer<=3&&Number.isInteger(m.view.columns)&&m.view.columns>0&&m.view.columns<=64&&m.player&&Number.isInteger(m.player.health);}
