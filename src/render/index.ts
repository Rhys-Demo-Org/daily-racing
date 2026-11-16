// Public API of the render layer. The game loop uses createRenderer + createRaceScene; everything
// else is exported for tests and gates.
export { createRenderer, pixelRatio, MAX_PIXEL_RATIO } from './renderer.ts';
export { createRaceScene, CELL_SIZE, type PlacedProp, type RaceScene } from './scene.ts';
export { CAMERA, cameraAngles, cameraDistance, countdownOffsetEast, createCameraRig } from './camera.ts';
export { buildCar, cabinColour, playerLivery, validateLivery, CAR, type CarLivery } from './car.ts';
export { createDust, DUST } from './dust.ts';
export { createMaterials, isFactoryMaterial, toonShade, TOP_FACE_MIN_Y } from './materials/index.ts';
export { addRamp, PROPS } from './props.ts';
export { CHUNK_ROWS, LAYER } from './track.ts';
export { MeshBuilder, allNormalsUp } from './geometry.ts';
