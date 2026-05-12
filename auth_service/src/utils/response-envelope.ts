import { Params, ResponseStructure } from '#types/index.js';

export const responseEnvelope = (params: Params) => {
    // Throw error if have data and error
    if (params.data && params.error)
        throw new Error('Cannot have data and error in response');
    // Throw error if no data or error
    if (!params.data && !params.error)
        throw new Error('No data or error in response');

    const baseResponse: ResponseStructure = {
        state: params.state,
        error: null,
        data: null,
        meta: {
            timestamp: new Date().toISOString(),
        },
    };
    // Only include error or data when they exist to reduce response size
    if (params.error) {
        baseResponse.error = params.error;
    }
    if (params.data) {
        baseResponse.data = params.data;
    }

    return baseResponse;
};
