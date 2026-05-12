const subscribers: Array<() => Promise<void>> = [];

export const subscribeShutdown = (subscriber: () => Promise<void>) => {
    subscribers.push(subscriber);
};

export const shutdown = async (): Promise<void> => {
    for (const subscriber of subscribers.reverse()) {
        await subscriber();
    }
};
