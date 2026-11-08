import Phaser from 'phaser';
import './index.css';
import { GAME_CONFIG } from './core/config';
import { inputController } from './input/InputController';
import { saveManager } from './save/SaveManager';
import { BootScene } from './scenes/BootScene';
import { ThresholdScene } from './scenes/ThresholdScene';
import { GameShellUI } from './ui/GameShellUI';

async function bootstrapAshenWorld(): Promise<void> {
  // 1. Initialize local persistence (IndexedDB save + LocalStorage settings)
  await saveManager.init();

  // 2. Initialize unified touch + keyboard input hub
  inputController.init();

  // 3. Mount mobile Landscape Game Shell UI overlay
  const hudMount = document.getElementById('hud-overlay');
  if (!hudMount) {
    throw new Error('Missing #hud-overlay mount element');
  }
  const shellUI = new GameShellUI(hudMount);
  shellUI.refreshSaveReadouts(saveManager.getCurrentSave());

  // 4. Configure and start Phaser 3 Engine
  const phaserConfig: Phaser.Types.Core.GameConfig = {
    type: Phaser.AUTO,
    parent: 'phaser-mount',
    width: GAME_CONFIG.LOGICAL_WIDTH,
    height: GAME_CONFIG.LOGICAL_HEIGHT,
    backgroundColor: '#090b10',
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH,
      width: GAME_CONFIG.LOGICAL_WIDTH,
      height: GAME_CONFIG.LOGICAL_HEIGHT,
    },
    physics: {
      default: 'arcade',
      arcade: {
        gravity: { x: 0, y: 0 },
        debug: false,
      },
    },
    render: {
      antialias: true,
      pixelArt: false,
      powerPreference: 'high-performance',
    },
    scene: [BootScene, ThresholdScene],
  };

  new Phaser.Game(phaserConfig);
}

void bootstrapAshenWorld();
