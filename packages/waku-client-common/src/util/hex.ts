/** Decodes unprefixed lowercase hex into bytes. */
export function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i += 1) {
    bytes[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

/** Encodes bytes as unprefixed lowercase hex. */
export function bytesToHex(bytes: Uint8Array): string {
  let hex = '';
  for (const byte of bytes) {
    hex += byte.toString(16).padStart(2, '0');
  }
  return hex;
}

export const utf8Encode = (text: string): Uint8Array => new TextEncoder().encode(text);

export const utf8Decode = (bytes: Uint8Array): string => new TextDecoder().decode(bytes);
