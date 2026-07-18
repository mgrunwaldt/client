import { useMemo } from "react";
import * as THREE from "three";

interface ShaderConfig {
  vertexShader: string;
  fragmentShader: string;
  glslVersion?: string;
}

export function useShader<T extends Record<string, THREE.IUniform>>(
  config: ShaderConfig,
  uniforms: T,
): THREE.ShaderMaterial & { uniforms: T } {
  const { vertexShader, fragmentShader } = config;

  const material = useMemo(() => {
    const mat = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms,
    });

    return mat as THREE.ShaderMaterial & { uniforms: T };
  }, [fragmentShader, uniforms, vertexShader]);

  return material;
}
