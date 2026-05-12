import { describe, it, expect } from 'vitest';

describe('Health Check', () => {
    it('should return 5 when 2 + 3', async () => {
        const result = 2 + 3;
        expect(result).toBe(5);
    });
});
