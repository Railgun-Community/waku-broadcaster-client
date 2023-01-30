type Debugger = {
  log: (msg: string) => void;
  error: (error: Error) => void;
};

export class RelayerDebug {
  private static debug: Optional<Debugger>;

  static init(debug: Debugger) {
    this.debug = debug;
  }

  static log(msg: string) {
    if (this.debug) {
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
