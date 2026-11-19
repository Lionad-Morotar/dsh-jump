/**
 * Host half of dsh-jump.
 *
 * The label overlay lives entirely in the browser half, and the host half
 * carries no behaviour of its own.
 * The entry stays mounted so the Loader row keeps a plugin object to load;
 * apply returns a no-op dispose to keep the cordis plugin shape intact.
 */
export const name = "dsh-jump";
export const inject: string[] = [];

export function apply(): () => void {
  return () => undefined;
}
