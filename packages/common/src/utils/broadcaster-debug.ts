import { BroadcasterDebugger } from '../models/export-models.js';

export class BroadcasterDebug {
  private static debug: Optional<BroadcasterDebugger>;

  static setDebugger(debug: BroadcasterDebugger) {
    this.debug = debug;
  }

  static log(msg: string) {
    if (this.debug) {
      console.log(msg); // temporary since startup isnt finishing
      this.debug.log(msg);
    }
  }

  static error(err: Error, ignoreInTests = false) {
    if (this.debug) {
      this.debug.error(err);
    }
    if (process.env.NODE_ENV === 'test' && !ignoreInTests) {
      // eslint-disable-next-line no-console
      console.error(err);
    }
  }
}
