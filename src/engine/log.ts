function format(scope: string, msg: any): string {
  let text = '';
  if (msg instanceof Error) {
    text = msg.stack || msg.message;
  } else if (typeof msg === 'string') {
    text = msg;
  } else {
    text = String(msg);
  }
  return text
    .split('\n')
    .map((line) => `[tm:${scope}] ${line}`)
    .join('\n');
}

export const log = {
  error(scope: string, msg: any, ...args: any[]): void {
    console.error(format(scope, msg), ...args);
  },
  warn(scope: string, msg: any, ...args: any[]): void {
    console.warn(format(scope, msg), ...args);
  },
  debug(scope: string, msg: any, ...args: any[]): void {
    if ((globalThis as any).__TM_DEBUG === true) {
      console.log(format(scope, msg), ...args);
    }
  },
};
