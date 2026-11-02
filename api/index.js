const { register } = require('node:module');
const { pathToFileURL } = require('node:url');
const path = require('node:path');

// Vercel npm install puts backend deps in /backend/node_modules; resolve tsx from there.
const backendRoot = path.join(__dirname, '..', 'backend');
register('tsx/esm', pathToFileURL(path.join(backendRoot, 'package.json')));

let appPromise;

module.exports = async function handler(req, res) {
    if (!appPromise) {
        appPromise = import(pathToFileURL(path.join(backendRoot, 'src', 'server.js')).href).then(
            (mod) => mod.default ?? mod.app,
        );
    }
    const app = await appPromise;
    return app(req, res);
};
