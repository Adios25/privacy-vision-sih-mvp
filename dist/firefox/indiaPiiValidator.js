(() => {
  const VERHOEFF_D = [[0,1,2,3,4,5,6,7,8,9],[1,2,3,4,0,6,7,8,9,5],[2,3,4,0,1,7,8,9,5,6],[3,4,0,1,2,8,9,5,6,7],[4,0,1,2,3,9,5,6,7,8],[5,9,6,7,8,0,1,2,3,4],[6,5,7,8,9,1,2,3,4,0],[7,6,8,9,5,2,3,4,0,1],[8,7,9,5,6,3,4,0,1,2],[9,8,5,6,7,4,0,1,2,3]];
  const VERHOEFF_P = [[0,1,2,3,4,5,6,7,8,9],[1,5,7,6,2,8,3,0,9,4],[5,8,0,3,7,9,6,1,4,2],[8,9,1,6,0,4,3,5,2,7],[9,4,5,3,1,2,6,8,7,0],[4,2,8,6,5,7,3,9,0,1],[2,7,9,5,8,0,4,3,1,6],[7,0,4,9,3,1,5,2,6,8]];
  const VERHOEFF_INV = [0,4,3,2,1,5,6,7,8,9];
  function digits(value) { return String(value || '').replace(/\D/g, ''); }
  function validVerhoeff(value) {
    const input = digits(value); if (input.length !== 12) return false;
    let checksum = 0; const reversed = input.split('').reverse();
    reversed.forEach((digit, index) => { checksum = VERHOEFF_D[checksum][VERHOEFF_P[(index + 1) % 8][Number(digit)]]; });
    return checksum === 0;
  }
  function validPan(value) { return /^[A-Z]{5}\d{4}[A-Z]$/.test(String(value || '').toUpperCase()); }
  function panHolderType(value) { const code = String(value || '').toUpperCase()[3]; return 'PCHFABGTJL'.includes(code) ? code : null; }
  function validIfsc(value) { return /^[A-Z]{4}0[A-Z0-9]{6}$/.test(String(value || '').toUpperCase()); }
  globalThis.PrivvyIndiaPii = { validVerhoeff, validPan, panHolderType, validIfsc };
})();
