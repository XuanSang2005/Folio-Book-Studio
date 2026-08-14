export interface ScheduledHeartbeat {
  cancel(): void;
}

export interface HeartbeatScheduler {
  every(milliseconds: number, callback: () => void): ScheduledHeartbeat;
}

export const systemHeartbeatScheduler: HeartbeatScheduler = {
  every(milliseconds, callback) {
    const timer = setInterval(callback, milliseconds);
    timer.unref();
    return { cancel: () => clearInterval(timer) };
  },
};
