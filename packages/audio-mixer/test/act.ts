/** Lets microtasks run: the fake state's listeners and the write queue. */
export const act = async (): Promise<void> => {
  for (let i = 0; i < 5; i += 1) await Promise.resolve();
};
