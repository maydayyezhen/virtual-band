const app = document.getElementById('app');

if (!app) throw new Error('Missing #app root');

app.dataset.ready = 'true';
console.info('[Virtual Band V2] clean scaffold ready');
