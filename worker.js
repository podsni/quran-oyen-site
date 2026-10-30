// Cloudflare Worker entry point for Quran Oyen's static site assets.
// API calls and audio streaming remain browser-to-EQuran.id; this Worker only serves the app files.
export default {
  async fetch(request, env) {
    return env.ASSETS.fetch(request);
  },
};
