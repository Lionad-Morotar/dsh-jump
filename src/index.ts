// Host half of dsh-jump. The Loader mounts both halves by package name, so the
// host entry must resolve even though this plugin lives entirely in the client
// half; apply stays empty until a host-side service is actually needed.
export const name = "dsh-jump";
export const inject: string[] = [];

export function apply(): void {}
