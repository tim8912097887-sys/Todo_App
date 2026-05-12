import { responseEnvelope } from '#utils/response-envelope.js';
import { describe, expect, it } from 'vitest';

describe('Response Envelope', () => {
    describe('Normal Case', () => {
        it('When provide only data in params, should return response with null error and data not null', async () => {
            const data = { message: 'John' };

            const response = responseEnvelope({ state: 'success', data });

            expect(response.error).toBe(null);
            expect(response.data).toBe(data);
        });

        it('When provide only error in params, should return response with error not null and data null', async () => {
            const error = {
                status: 'BadRequestError',
                code: 400,
                detail: 'Bad Request',
            };

            const response = responseEnvelope({ state: 'error', error });

            expect(response.error).toBe(error);
            expect(response.data).toBe(null);
        });
    });

    describe('Error Case', () => {
        it('When provide both data and error in params, should throw error', async () => {
            const data = { message: 'John' };
            const error = {
                status: 'BadRequestError',
                code: 400,
                detail: 'Bad Request',
            };

            expect(() =>
                responseEnvelope({ state: 'error', data, error }),
            ).toThrow('Cannot have data and error in response');
        });

        it('When provide no data or error in params, should throw error', async () => {
            expect(() => responseEnvelope({ state: 'error' })).toThrow(
                'No data or error in response',
            );
        });
    });
});
