// Public API of the render layer. The game loop uses createRenderer + createRaceScene; everything
// else is exported for tests, gates and future features.
export { createRenderer, pixelRatio, MAX_PIXEL_RATIO } from './renderer.ts';
export { createRaceScene, CELL_SIZE, type PlacedProp, type RaceScene } from './scene.ts';
export { CAMERA, cameraAngles, cameraDistance, createCameraRig, frameWidthFor, type CameraRig } from './camera.ts';
export { buildCar, cabinColour, playerLivery, validateLivery, CAR, type CarLivery, type CarObject } from './car.ts';
export { createDust, DUST, type DustPool } from './dust.ts';
export { createMaterials, isFactoryMaterial, toonShade, LIGHT_DIRECTION, TOON_STEPS, TOP_FACE_MIN_Y, type Materials } from './materials/index.ts';
export { attachOutline, groundMesh, outlinedFlatMesh, solidMesh, type RenderRole } from './outline.ts';
export { addRamp, PROPS } from './props.ts';
export { CHUNK_ROWS, LAYER } from './track.ts';
export { MeshBuilder, allNormalsUp } from './geometry.ts';
