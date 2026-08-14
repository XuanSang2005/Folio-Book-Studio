export interface ScheduledHeartbeat {
  cancel(): void;
}

export interface HeartbeatScheduler {
  every(milliseconds: number, callback: () => void): ScheduledHeartbeat;
  close?(): void;
}

const activeTimers = new Set<NodeJS.Timeout>();

export const systemHeartbeatScheduler: HeartbeatScheduler = {
  every(milliseconds, callback) {
    const timer = setInterval(callback, milliseconds);
    timer.unref();
    activeTimers.add(timer);
    return {
      cancel: () => {
        clearInterval(timer);
        activeTimers.delete(timer);
      },
    };
  },
  close() {
    for (const timer of activeTimers) clearInterval(timer);
    activeTimers.clear();
  },
};
