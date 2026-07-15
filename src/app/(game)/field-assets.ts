import { useFBX, useGLTF, useTexture } from "@react-three/drei";

const defenderTextures = [
  "/models/in-game/textures/defenders/BaseTeam_1_Skin_1.png",
  "/models/in-game/textures/defenders/BaseTeam_1_Skin_2.png",
  "/models/in-game/textures/defenders/BaseTeam_1_Skin_3.png",
  "/models/in-game/textures/defenders/BaseTeam_2_Skin_1.png",
  "/models/in-game/textures/defenders/BaseTeam_2_Skin_2.png",
  "/models/in-game/textures/defenders/BaseTeam_2_Skin_3.png",
];

const goalkeeperTextures = [
  "/models/in-game/textures/goalkeepers/Goalkeeper_1_Skin_1.png",
  "/models/in-game/textures/goalkeepers/Goalkeeper_1_Skin_2.png",
  "/models/in-game/textures/goalkeepers/Goalkeeper_1_Skin_3.png",
  "/models/in-game/textures/goalkeepers/Goalkeeper_2_Skin_1.png",
  "/models/in-game/textures/goalkeepers/Goalkeeper_2_Skin_2.png",
  "/models/in-game/textures/goalkeepers/Goalkeeper_2_Skin_3.png",
];

const accessoryTextures = [
  "/models/Male/new-text/Accesories_Mat_1.png",
  "/models/Male/new-text/Accesories_Mat_2.png",
  "/models/Male/new-text/Accesories_Mat_3.png",
  "/models/Male/new-text/Accesories_Mat_4.png",
  "/models/Male/new-text/Accesories_Mat_5.png",
  "/models/Male/new-text/Accesories_Mat_6.png",
  "/models/Male/new-text/Accesories_Mat_7.png",
];

const fieldTextures = [
  "/models/in-game/Pitch desing.png",
  "/models/in-game/Net.png",
  "/field/aim-arrow-shaft.svg",
  "/field/aim-arrow-head.svg",
  "/field/aim-arrow-tip-glow.svg",
];

[
  "/models/in-game/ST.glb",
  "/models/in-game/Ball/Ball.glb",
].forEach((asset) => {
  useGLTF.preload(asset);
});

[
  "/models/in-game/game_model_1.fbx",
  "/models/in-game/game_model_2.fbx",
  "/models/in-game/game_model_3.fbx",
  "/models/in-game/animations/DefensiveIdle.fbx",
  "/models/in-game/animations/JogForward.fbx",
  "/models/in-game/animations/JogForwardDiagonalLeft.fbx",
  "/models/in-game/animations/JogForwardDiagonalRight.fbx",
  "/models/in-game/animations/StrikeForwardJog.fbx",
].forEach((asset) => {
  useFBX.preload(asset);
});

[
  ...defenderTextures,
  ...goalkeeperTextures,
  ...accessoryTextures,
  ...fieldTextures,
].forEach((asset) => {
  useTexture.preload(asset);
});

export {};
