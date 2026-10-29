// Entry point: tokens and base styles, the game, and the gate driver.
import '@tokens/css';
import './ui/base.css';
import { installDriver } from './driver/index.ts';
import { createGame } from './game.ts';

const app = document.getElementById('app');
if (!app) throw new Error('#app missing from index.html');
installDriver(createGame(app));
