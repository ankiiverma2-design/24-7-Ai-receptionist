/**
 * Minimal RFC 6455 WebSocket server (zero-dependency).
 *
 * Node ships a global WebSocket *client* but no server, so we implement the
 * handshake + frame codec over the HTTP `upgrade` event. This is what Twilio
 * Media Streams connects to. Scope is intentionally focused on what we need:
 * text + binary frames, ping/pong, close, fragmentation, and buffering partial
 * frames across TCP chunks.
 */
import type { IncomingMessage } from 'node:http';
import type { Duplex } from 'node:stream';
import { createHash } from 'node:crypto';

const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';

function acceptKey(key: string): string {
  return createHash('sha1').update(key + GUID).digest('base64');
}

type MessageHandler = (data: string) => void;
type CloseHandler = () => void;

export class WsConnection {
  private socket: Duplex;
  private buffer: Buffer = Buffer.alloc(0);
  private messageHandlers: MessageHandler[] = [];
  private closeHandlers: CloseHandler[] = [];
  private closed = false;
  /** Assembles fragmented text messages. */
  private fragments: Buffer[] = [];

  constructor(socket: Duplex) {
    this.socket = socket;
    this.socket.on('data', (chunk: Buffer) => this.onData(chunk));
    this.socket.on('close', () => this.handleClose());
    this.socket.on('error', () => this.handleClose());
  }

  onMessage(handler: MessageHandler): void {
    this.messageHandlers.push(handler);
  }

  onClose(handler: CloseHandler): void {
    this.closeHandlers.push(handler);
  }

  private handleClose(): void {
    if (this.closed) return;
    this.closed = true;
    for (const h of this.closeHandlers) h();
  }

  private onData(chunk: Buffer): void {
    this.buffer = Buffer.concat([this.buffer, chunk]);
    this.parseFrames();
  }

  private parseFrames(): void {
    while (this.buffer.length >= 2) {
      const b0 = this.buffer[0];
      const b1 = this.buffer[1];
      const fin = (b0 & 0x80) !== 0;
      const opcode = b0 & 0x0f;
      const masked = (b1 & 0x80) !== 0;
      let len = b1 & 0x7f;
      let offset = 2;

      if (len === 126) {
        if (this.buffer.length < offset + 2) return;
        len = this.buffer.readUInt16BE(offset);
        offset += 2;
      } else if (len === 127) {
        if (this.buffer.length < offset + 8) return;
        len = Number(this.buffer.readBigUInt64BE(offset));
        offset += 8;
      }

      let mask: Buffer | null = null;
      if (masked) {
        if (this.buffer.length < offset + 4) return;
        mask = this.buffer.subarray(offset, offset + 4);
        offset += 4;
      }

      if (this.buffer.length < offset + len) return; // wait for more data

      const payload = Buffer.alloc(len);
      for (let i = 0; i < len; i++) {
        payload[i] = mask ? this.buffer[offset + i] ^ mask[i % 4] : this.buffer[offset + i];
      }
      this.buffer = this.buffer.subarray(offset + len);

      this.handleFrame(fin, opcode, payload);
    }
  }

  private handleFrame(fin: boolean, opcode: number, payload: Buffer): void {
    switch (opcode) {
      case 0x0: // continuation
      case 0x1: // text
      case 0x2: // binary
        this.fragments.push(payload);
        if (fin) {
          const full = Buffer.concat(this.fragments);
          this.fragments = [];
          const text = full.toString('utf8');
          for (const h of this.messageHandlers) h(text);
        }
        break;
      case 0x8: // close
        this.close();
        break;
      case 0x9: // ping -> pong
        this.sendFrame(0xa, payload);
        break;
      case 0xa: // pong
        break;
      default:
        break;
    }
  }

  private sendFrame(opcode: number, payload: Buffer): void {
    if (this.closed || this.socket.destroyed) return;
    const len = payload.length;
    let header: Buffer;
    if (len < 126) {
      header = Buffer.from([0x80 | opcode, len]);
    } else if (len < 65536) {
      header = Buffer.alloc(4);
      header[0] = 0x80 | opcode;
      header[1] = 126;
      header.writeUInt16BE(len, 2);
    } else {
      header = Buffer.alloc(10);
      header[0] = 0x80 | opcode;
      header[1] = 127;
      header.writeBigUInt64BE(BigInt(len), 2);
    }
    this.socket.write(Buffer.concat([header, payload]));
  }

  /** Send a text message. */
  send(data: string): void {
    this.sendFrame(0x1, Buffer.from(data, 'utf8'));
  }

  close(): void {
    if (this.closed) return;
    try {
      this.sendFrame(0x8, Buffer.alloc(0));
      this.socket.end();
    } catch {
      /* ignore */
    }
    this.handleClose();
  }
}

/** Complete the WebSocket handshake and return a WsConnection. */
export function acceptUpgrade(req: IncomingMessage, socket: Duplex): WsConnection {
  const key = req.headers['sec-websocket-key'];
  if (typeof key !== 'string') {
    socket.destroy();
    throw new Error('Missing Sec-WebSocket-Key');
  }
  socket.write(
    'HTTP/1.1 101 Switching Protocols\r\n' +
      'Upgrade: websocket\r\n' +
      'Connection: Upgrade\r\n' +
      `Sec-WebSocket-Accept: ${acceptKey(key)}\r\n\r\n`,
  );
  return new WsConnection(socket);
}
