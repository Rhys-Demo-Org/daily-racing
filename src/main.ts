// Entry point. Milestone 2 replaces this with the game; for now it only proves tokens and fonts load.
import '@tokens/css';
import './ui/base.css';

const app = document.getElementById('app');
if (app) {
  const title = document.createElement('h1');
  title.className = 'placeholder-title';
  title.textContent = 'Daily AI Racer';
  app.append(title);
}
