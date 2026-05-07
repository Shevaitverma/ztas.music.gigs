import { Elysia } from 'elysia';

export const debugPlugin = () => {
  console.error('DEBUG PLUGIN INITIALIZED');
  return new Elysia({ name: 'debug' })
    .onAfterHandle(({ request }) => {
       console.error('DEBUG PLUGIN TRIGGERED: ' + request.url);
    });
};
