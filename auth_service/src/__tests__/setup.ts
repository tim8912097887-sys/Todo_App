import { beforeEach, vitest } from 'vitest';

beforeEach(() => {
    vitest.resetAllMocks();
    vitest.restoreAllMocks();
    vitest.clearAllMocks();
});
