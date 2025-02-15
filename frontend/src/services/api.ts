export const api = {
    baseUrl: 'http://localhost:3000/api',
    get: async (endpoint: string) => {
      return fetch(`${api.baseUrl}/${endpoint}`);
    }
  };